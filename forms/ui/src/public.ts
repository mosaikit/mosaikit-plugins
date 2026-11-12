// Public page of a form: the form as a visitor fills it in, with no account. No session: everything goes through the public
// commands `public_form` (read) and `public_submit` (adds one answer). A visitor never sees the answers of others, nor how
// many there are. The browser keeps a random id in localStorage («one answer per browser»: a hint, not a proof). The page
// has no `msk.context`, so the language is the one of the browser.
import '@mosaikit/plugin-api/style.css'
import './forms.css'
import { connect, el, errText, type Msk } from '@mosaikit/plugin-api'
import { fillForm } from './fill.ts'
import { isUuid, newBrowserId, publicProblem, type Field } from './logic.ts'
import { TEXTS, langOf, sub } from './texts.ts'

const app = document.getElementById('app')!

interface PublicForm {
  title: string
  intro: string
  thanks: string
  open: boolean
  closed: boolean
  full: boolean
  fields: Field[]
}

const KEY = 'mosaikit.forms.browser'

/** The id of this browser: kept in localStorage, made up the first time (in memory only when storage is blocked). */
function browserId(): string {
  try {
    const old = localStorage.getItem(KEY)
    if (isUuid(old)) return old
    const id = newBrowserId()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return newBrowserId()
  }
}

function mount(msk: Msk) {
  const t = TEXTS[langOf(undefined)]
  document.documentElement.lang = langOf(undefined)
  const browser = browserId()
  app.classList.add('fm', 'fm-public')

  const problemText = (e: unknown): string => {
    switch (publicProblem(e)) {
      case 'already':
        return t.pAlready
      case 'closed':
        return t.pClosed
      case 'full':
        return t.pFull
      case 'rate':
        return t.pRate
      case 'off':
        return t.pOff
      case 'rejected':
        return t.pRejected
      case 'invalid':
        return sub(t.pInvalid, { error: errText(e) })
      default:
        return sub(t.pSendFailed, { error: errText(e) })
    }
  }

  const page = (form: PublicForm, ...children: (HTMLElement | null)[]) => {
    document.title = form.title
    const main = el('main', {}, el('h1', { class: 'fm-ptitle' }, form.title))
    if (form.intro.trim()) main.append(el('p', { class: 'fm-intro' }, form.intro))
    for (const c of children) if (c) main.append(c)
    app.replaceChildren(main)
  }

  const thanks = (form: PublicForm, text: string) =>
    page(form, el('section', { class: 'fm-thanks', role: 'status', 'data-testid': 'thanks' }, el('h2', {}, t.thanksTitle), el('p', {}, text || t.thanksDefault)))

  const draw = (form: PublicForm) => {
    if (!form.open) {
      page(form, el('p', { class: 'fm-notice warn', role: 'alert', 'data-testid': 'notice' }, form.full ? t.pFull : t.pClosed))
      return
    }
    if (!form.fields.length) {
      page(form, el('p', { class: 'fm-notice', role: 'status' }, t.noFieldsFill))
      return
    }
    const fill = fillForm({
      fields: form.fields,
      t,
      prefix: 'pf',
      honeypot: true,
      errorText: problemText,
      onSubmit: async (values, website) => {
        try {
          const out = await msk.publicCall<{ ok: boolean; thanks: string }>('public_submit', { browser, values, website })
          thanks(form, out.thanks || form.thanks)
        } catch (e) {
          // a form that closed or filled up while it was open on the page: say what it is now
          if (publicProblem(e) === 'closed' || publicProblem(e) === 'full') {
            await load()
            return
          }
          throw e
        }
      },
    })
    page(form, fill)
  }

  const load = async () => {
    try {
      draw(await msk.publicCall<PublicForm>('public_form', {}))
    } catch (e) {
      const text = publicProblem(e) === 'off' ? t.pOff : publicProblem(e) === 'rate' ? t.pRate : sub(t.pOpenFailed, { error: errText(e) })
      app.replaceChildren(el('p', { class: 'fm-notice warn', role: 'alert', 'data-testid': 'notice' }, text))
    }
  }
  void load()
}

connect()
  .then(mount)
  .catch((e) => {
    app.textContent = sub(TEXTS[langOf(undefined)].pOpenFailed, { error: errText(e) })
  })
