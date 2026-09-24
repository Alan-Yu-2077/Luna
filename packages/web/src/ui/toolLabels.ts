import { ToolName } from '@luna/protocol';
import { uiLang, type Bilingual, type UiLang } from './uiCopy';

// Presentation mapping: the controller emits tool chips as `🔧 <tool_name>…`
// (started) / `🔧 <summary>` (finished). The friendly per-tool label is a
// view concern, so it lives here rather than in the controller — keeping the
// shared controller untouched. Unknown text falls through stripped.
// v0.48.0: every tool, in both interface languages — a complete Record, so a new tool that has no
// label is a compile error instead of a raw `music_lyrics` on screen. `remember` moved off 💭,
// which is the second-thought glyph. The FINISH line stays the tool's own summary, untranslated.
const CUTE: Record<ToolName, Bilingual> = {
  time_now: { en: 'checked the time 🕐', zh: '看了眼时间 🕐' },
  read_file: { en: 'read something 📖', zh: '读了点东西 📖' },
  remember: { en: 'kept it in mind 📌', zh: '记下了 📌' },
  enter_dream: { en: 'getting ready to dream 🌙', zh: '准备去做梦 🌙' },
  message: { en: 'said something 💬', zh: '说了句话 💬' },
  recall: { en: 'flipped through memories 🔖', zh: '翻了翻记忆 🔖' },
  list_files: { en: 'looked through files 📂', zh: '翻了翻文件 📂' },
  grep: { en: 'searched the code 🔍', zh: '搜了搜代码 🔍' },
  edit: { en: 'edited a file ✏️', zh: '改了个文件 ✏️' },
  multi_edit: { en: 'edited a file ✏️', zh: '改了个文件 ✏️' },
  write_file: { en: 'wrote a file 📝', zh: '写了个文件 📝' },
  shell: { en: 'ran a command 💻', zh: '跑了条命令 💻' },
  typecheck: { en: 'type-checked ✅', zh: '跑了类型检查 ✅' },
  run_tests: { en: 'ran the tests 🧪', zh: '跑了测试 🧪' },
  lint: { en: 'checked formatting 🎨', zh: '查了格式 🎨' },
  repo_map: { en: 'mapped the codebase 🗺️', zh: '摸了遍代码结构 🗺️' },
  find_symbol: { en: 'located a symbol 🔎', zh: '找到了定义 🔎' },
  plan: { en: 'updated the plan 📋', zh: '更新了计划 📋' },
  save_skill: { en: 'saved a skill 🧠', zh: '存了个技能 🧠' },
  recall_skill: { en: 'recalled a skill 💡', zh: '想起一个技能 💡' },
  propose_self_edit: { en: 'proposed a self-edit ✍️', zh: '提了个改自己的方案 ✍️' },
  web_search: { en: 'searched the web 🔍', zh: '上网搜了搜 🔍' },
  web_fetch: { en: 'read a web page 🌐', zh: '读了个网页 🌐' },
  weather: { en: 'checked the weather 🌦', zh: '看了看天气 🌦' },
  music_now: { en: 'glanced at the music 🎵', zh: '看了眼在放什么 🎵' },
  music_control: { en: 'reached for the player ⏯', zh: '动了下播放器 ⏯' },
  music_library: { en: 'browsed the listening history 📚', zh: '翻了翻听歌记录 📚' },
  music_lyrics: { en: 're-read the lyrics 🎼', zh: '看了看歌词 🎼' },
};

function strip(s: string): string {
  return s.replace(/^🔧\s*/, '').replace(/…+$/, '').trim();
}

export function toolCardLabel(chipText: string, lang: UiLang = uiLang()): string {
  const stripped = strip(chipText);
  // Exact match only: a START chip is `🔧 <tool_name>…`, so the stripped text IS
  // the tool name. A substring `includes` (the old code) mislabeled `recall_skill`
  // as `recall` and rewrote any FINISH summary that merely contained a tool-name
  // substring. A finish summary is free text → not a ToolName → its stripped form.
  const parsed = ToolName.safeParse(stripped);
  if (parsed.success) return CUTE[parsed.data][lang];
  return stripped;
}
