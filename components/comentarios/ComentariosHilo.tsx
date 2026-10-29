'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Flag, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { sendNotification } from '@/lib/notify'
import { avisoDeLinks, esRechazoPorLinks, MENSAJE_SIN_LINKS } from '@/lib/sin-links'
import { COLUMNA_DESTINO, TABLA_COMENTARIOS, TIPO_REPORTE, useMeGustaComentarios } from '@/lib/comentarios'
import MentionTextarea from '@/components/MentionTextarea'
import ReportModal from '@/components/ReportModal'
import VerifiedBadge from '@/components/VerifiedBadge'
import MeGustaComentario from './MeGustaComentario'

interface Autor {
  id: string; username: string | null; display_name: string | null; avatar_url: string | null
}
interface Comentario {
  id: string; user_id: string; parent_id: string | null; content: string; created_at: string
  author: Autor | null
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Los `@usuario` del texto, como links al perfil (igual que en las reseñas). */
function ConMenciones({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@\w+)/g).map((part, i) =>
        /^@\w+$/.test(part) ? (
          <Link key={i} href={`/usuario/${part.slice(1)}`} style={{ color: '#FFFD02' }} className="hover:underline">
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

interface Props {
  /** A qué se comenta: una lista (por id) o una guía (por slug). */
  tipo: 'list' | 'guide'
  destino: string
  /** El nombre de la lista o la guía, para la notificación al que le responden. */
  tituloDestino: string
  /** El dueño de la lista: recibe el aviso de cada comentario nuevo y puede borrarlos. Las guías no tienen. */
  duenioId?: string | null
}

/**
 * Los comentarios de una lista o de una guía: comentar, responder (un nivel),
 * me gusta, reportar y borrar los propios. Los de reseñas siguen en
 * `ReviewCard` y en la página de la reseña, que ya tenían respuestas.
 *
 * Se leen sin sesión; para escribir hay que ingresar. Los textos con links los
 * frena antes `avisoDeLinks` y, si se escapa alguno, el trigger de la base
 * (`esRechazoPorLinks`).
 *
 * Al responder se le avisa al autor del comentario (`comment_reply`, con la
 * lista o la guía en `entity_*`). Sin `comment_id`: esa columna apunta a
 * `review_comments` y un id de otra tabla haría fallar el insert.
 */
export default function ComentariosHilo({ tipo, destino, tituloDestino, duenioId }: Props) {
  const [supabase] = useState(createClient)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const tabla = TABLA_COMENTARIOS[tipo]
  const columna = COLUMNA_DESTINO[tipo]

  const [userId, setUserId] = useState<string | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [cargando, setCargando] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [respondiendo, setRespondiendo] = useState<{ id: string; username: string; authorId: string } | null>(null)
  const [reporte, setReporte] = useState<{ id: string; authorId: string } | null>(null)

  const meGusta = useMeGustaComentarios(tipo, comentarios.map(c => c.id), userId)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      const [{ data: auth }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from(tabla).select('id, user_id, parent_id, content, created_at').eq(columna, destino).order('created_at'),
      ])
      if (!vivo) return
      setUserId(auth.user?.id ?? null)
      if (error) console.error(`[comentarios] ${tabla}:`, error.message)

      const filas = (data ?? []) as Omit<Comentario, 'author'>[]
      const ids = [...new Set(filas.map(c => c.user_id))]
      let perfiles: Record<string, Autor> = {}
      if (ids.length > 0) {
        const { data: ps } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids)
        perfiles = Object.fromEntries(((ps ?? []) as Autor[]).map(p => [p.id, p]))
      }
      if (!vivo) return
      setComentarios(filas.map(c => ({ ...c, author: perfiles[c.user_id] ?? null })))
      setCargando(false)
    }
    void cargar()
    return () => { vivo = false }
  }, [supabase, tabla, columna, destino])

  const { principales, respuestas } = useMemo(() => {
    const respuestas: Record<string, Comentario[]> = {}
    for (const c of comentarios) {
      if (c.parent_id) respuestas[c.parent_id] = [...(respuestas[c.parent_id] ?? []), c]
    }
    return { principales: comentarios.filter(c => !c.parent_id), respuestas }
  }, [comentarios])

  async function enviar() {
    const contenido = texto.trim()
    if (!userId || !contenido || enviando) return
    const aviso = avisoDeLinks('comentario', contenido)
    if (aviso) { toast.error(aviso); return }
    setEnviando(true)

    const { data, error } = await supabase.from(tabla)
      .insert({ [columna]: destino, user_id: userId, parent_id: respondiendo?.id ?? null, content: contenido })
      .select('id, user_id, parent_id, content, created_at')
      .single()

    if (error || !data) {
      toast.error(esRechazoPorLinks(error) ? MENSAJE_SIN_LINKS.comentario : 'No se pudo publicar el comentario.')
      setEnviando(false)
      return
    }

    const { data: perfil } = await supabase.from('profiles')
      .select('id, username, display_name, avatar_url').eq('id', userId).maybeSingle()
    setComentarios(prev => [...prev, { ...(data as Omit<Comentario, 'author'>), author: (perfil as Autor | null) ?? null }])

    // Avisos, sin esperar: el comentario ya está publicado.
    const sb = supabase as Parameters<typeof sendNotification>[0]
    if (respondiendo && respondiendo.authorId !== userId) {
      void sendNotification(sb, {
        user_id: respondiendo.authorId,
        actor_id: userId,
        type: 'comment_reply',
        entity_id: destino,
        entity_type: tipo,
        entity_title: tituloDestino,
      })
    } else if (!respondiendo && tipo === 'list' && duenioId && duenioId !== userId) {
      void sendNotification(sb, {
        user_id: duenioId,
        actor_id: userId,
        type: 'list_comment',
        entity_id: destino,
        entity_type: 'list',
        entity_title: tituloDestino,
      })
    }

    setTexto('')
    setRespondiendo(null)
    setEnviando(false)
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar este comentario?')) return
    const { error } = await supabase.from(tabla).delete().eq('id', id)
    if (error) { toast.error('No se pudo eliminar el comentario.'); return }
    // Sus respuestas se van con él (ON DELETE CASCADE).
    setComentarios(prev => prev.filter(c => c.id !== id && c.parent_id !== id))
  }

  function responder(c: Comentario) {
    setRespondiendo({ id: c.id, username: c.author?.username ?? 'usuario', authorId: c.user_id })
    setTexto('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Una función y no un componente: definido adentro, React lo trataría como
  // un componente nuevo en cada render y perdería el estado de la fila.
  function fila(c: Comentario, esRespuesta: boolean) {
    const nombre = c.author?.display_name ?? c.author?.username ?? 'Usuario'
    const propio = c.user_id === userId
    const puedeBorrar = propio || (tipo === 'list' && !!duenioId && duenioId === userId)
    const avatar = esRespuesta ? 'w-6 h-6' : 'w-8 h-8'
    return (
      <div key={c.id} className="flex gap-3 group/comentario">
        <Link href={`/usuario/${c.author?.username ?? ''}`} className={`${avatar} rounded-full overflow-hidden bg-zinc-700 shrink-0 mt-0.5`}>
          {c.author?.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.author.avatar_url} alt={nombre} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-[#2A2A3A] text-[#FFFD02]">{nombre[0]?.toUpperCase()}</div>
          }
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <Link href={`/usuario/${c.author?.username ?? ''}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">{nombre}</Link>
            <VerifiedBadge userId={c.user_id} size={13} />
            <span className="text-[11px] text-[#A0A0B0]">{timeAgo(c.created_at)}</span>
            {puedeBorrar ? (
              <button onClick={() => void borrar(c.id)} title="Eliminar comentario"
                className="ml-auto text-zinc-700 hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            ) : userId ? (
              <button onClick={() => setReporte({ id: c.id, authorId: c.user_id })} title="Reportar comentario"
                className="ml-auto opacity-0 group-hover/comentario:opacity-100 text-zinc-600 hover:text-[#FFFD02] transition-all">
                <Flag size={12} />
              </button>
            ) : null}
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words"><ConMenciones text={c.content} /></p>
          <div className="flex items-center gap-3 mt-1">
            <MeGustaComentario
              cantidad={meGusta.cuenta[c.id] ?? 0}
              mio={meGusta.mios.has(c.id)}
              onClick={() => void meGusta.alternar(c.id)}
              puedeTocar={!!userId}
              size={12}
            />
            {userId && (
              <button onClick={() => responder(c)} className="text-[11px] text-zinc-600 hover:text-[#A0A0B0] transition-colors">
                Responder
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section id="comentarios" className="border-t border-[#2A2A3A] pt-8 scroll-mt-24">
      <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
        <MessageCircle size={18} />
        {comentarios.length > 0 ? `${comentarios.length} ${comentarios.length === 1 ? 'comentario' : 'comentarios'}` : 'Comentarios'}
      </h2>

      {userId ? (
        <div className="mb-6">
          {respondiendo && (
            <div className="flex items-center gap-1.5 mb-2 text-xs text-[#A0A0B0]">
              <span>Respondiendo a <span className="text-zinc-300 font-medium">@{respondiendo.username}</span></span>
              <button onClick={() => setRespondiendo(null)} className="text-zinc-600 hover:text-white transition-colors ml-1" title="Cancelar">
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <MentionTextarea
              textareaRef={inputRef}
              value={texto}
              onChange={setTexto}
              placeholder={respondiendo ? `Responder a @${respondiendo.username}...` : 'Escribí un comentario...'}
              rows={2}
              className="flex-1 bg-[#13131A] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none transition-colors"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
            />
            <button onClick={() => void enviar()} disabled={!texto.trim() || enviando} title="Publicar"
              className="px-4 py-2 rounded-xl bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 text-black text-sm font-semibold transition-colors self-end">
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : !cargando && (
        <p className="text-sm text-[#A0A0B0] mb-6">
          <Link href="/auth" className="text-[#FFFD02] hover:underline">Ingresá</Link> para comentar.
        </p>
      )}

      {cargando ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : principales.length === 0 ? (
        <p className="text-[#A0A0B0] text-sm text-center py-6">Sin comentarios todavía.</p>
      ) : (
        <div className="space-y-5">
          {principales.map(c => (
            <div key={c.id}>
              {fila(c, false)}
              {(respuestas[c.id] ?? []).length > 0 && (
                <div className="ml-11 mt-3 space-y-3 border-l-2 border-[#2A2A3A] pl-4">
                  {respuestas[c.id].map(r => fila(r, true))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {reporte && (
        <ReportModal
          contentType={TIPO_REPORTE[tipo]}
          contentId={reporte.id}
          contentAuthorId={reporte.authorId}
          isOpen
          onClose={() => setReporte(null)}
        />
      )}
    </section>
  )
}
