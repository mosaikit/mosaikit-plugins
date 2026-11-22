// Syntax colours of the code of a snippet: highlight.js core with the grammars of the kinds, registered one by one so the
// bundle holds nothing else. This file is a chunk of its own, loaded when the first snippet is shown.
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const grammars = { bash, css, javascript, json, markdown, python, rust, sql, typescript, xml, yaml }
for (const [name, grammar] of Object.entries(grammars)) hljs.registerLanguage(name, grammar)

/** The code as HTML with `hljs-*` spans (every character of the code is escaped); null when the language is unknown or fails. */
export function highlight(code: string, language: string): string | null {
  if (!hljs.getLanguage(language)) return null
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return null
  }
}
