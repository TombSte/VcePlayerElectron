import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readVceFile } from '../src/main/vce/reader'

const dir = process.argv[2] ?? '/tmp/vce_refs/sneklyudov_Converter/ExamUniverse.Converter.VCE.Tests/Files'

for (const name of readdirSync(dir).filter((f) => f.endsWith('.vce'))) {
  try {
    const file = readVceFile(new Uint8Array(readFileSync(join(dir, name))), name)
    const hist = new Map<number, number>()
    for (const e of file.exams) for (const q of e.questions) hist.set(q.rawType, (hist.get(q.rawType) ?? 0) + 1)
    const qs = file.exams.flatMap((e) => e.questions)
    const dnd = qs.filter((q) => q.rawType === 2)
    const ha = qs.filter((q) => q.rawType === 9)
    const extra = [
      dnd.length
        ? `DND[${dnd.length}] drag=${dnd[0].dragAreas.length} drop=${dnd[0].dropAreas.length} ans="${dnd[0].answers}" img=${dnd[0].areaImage ? 'y' : 'n'} q="${dnd[0].question.replace(/<[^>]*>/g, '').slice(0, 40)}"`
        : '',
      ha.length ? `HA[${ha.length}] areas=${ha[0].hotAreas.length} ans="${ha[0].answers}"` : ''
    ]
      .filter(Boolean)
      .join(' ')
    console.log(name.padEnd(48), [...hist.entries()].map(([k, v]) => `${k}:${v}`).join(' '), extra)
  } catch (e) {
    console.log(name.padEnd(48), 'ERR', (e as Error).message.slice(0, 60))
  }
}
