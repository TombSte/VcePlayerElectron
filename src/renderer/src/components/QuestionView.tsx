import { useEffect, useMemo, useRef, useState } from 'react'
import { VceQuestion, VceQuestionType, isPlacementType } from '@shared/types'
import { choiceLetter, parseNumberSet, sortLetters } from '../state/exam-utils'
import { areaImageSource } from '@shared/vce/image'

export interface QuestionViewProps {
  question: VceQuestion
  answer: string
  onAnswer: (value: string) => void
  readOnly?: boolean
  showAnswer?: boolean
  /** For choice questions: order[displayIndex] = originalIndex */
  choiceOrder?: number[]
  interactive?: boolean
}

function Html({ html }: { html: string }): JSX.Element {
  return <div className="question-body" dangerouslySetInnerHTML={{ __html: html }} />
}

function CroppedImage({ src, area }: { src: string; area: { x: number; y: number; width: number; height: number } }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, area.width)
        canvas.height = Math.max(1, area.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
        if (!cancelled) setDataUrl(canvas.toDataURL())
      } catch {
        /* ignore */
      }
    }
    image.src = src
    return () => {
      cancelled = true
    }
  }, [src, area.x, area.y, area.width, area.height])
  return dataUrl ? <img src={dataUrl} style={{ maxWidth: area.width, maxHeight: 80 }} /> : <span className="hint">[item]</span>
}

function ChoiceView({ question, answer, onAnswer, readOnly, choiceOrder }: QuestionViewProps): JSX.Element {
  const multi = question.type === VceQuestionType.MultipleChoice
  const order = choiceOrder ?? question.variants.map((_, i) => i)
  const selectedOriginal = sortLetters(answer)
  const selected = new Set(selectedOriginal.split('').map((l) => l.charCodeAt(0) - 65))

  const toggle = (displayIndex: number): void => {
    if (readOnly) return
    const originalIndex = order[displayIndex]
    const current = new Set(selectedOriginal.split(''))
    const letter = choiceLetter(originalIndex)
    if (multi) {
      if (current.has(letter)) current.delete(letter)
      else current.add(letter)
      onAnswer([...current].sort().join(''))
    } else {
      onAnswer(letter)
    }
  }

  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label="Answer choices">
      {order.map((originalIndex, displayIndex) => {
        const checked = selected.has(originalIndex)
        return (
          <label className={`choice${checked ? ' selected' : ''}`} key={displayIndex}>
            <input
              type={multi ? 'checkbox' : 'radio'}
              checked={checked}
              disabled={readOnly}
              onChange={() => toggle(displayIndex)}
            />
            <span className="choice-letter">{choiceLetter(displayIndex)}.</span>
            <span dangerouslySetInnerHTML={{ __html: question.variants[originalIndex] ?? '' }} />
          </label>
        )
      })}
    </div>
  )
}

function FillInTheBlank({ answer, onAnswer, readOnly }: QuestionViewProps): JSX.Element {
  return (
    <input
      type="text"
      value={answer}
      readOnly={readOnly}
      placeholder="Type your answer"
      aria-label="Your answer"
      onChange={(e) => onAnswer(e.target.value)}
    />
  )
}

/** Hot Area and Point and Shoot share the click-to-select interaction. */
function HotAreaView({ question, answer, onAnswer, readOnly }: QuestionViewProps): JSX.Element {
  const selected = new Set(parseNumberSet(answer))
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)

  const updateScale = (): void => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    setScale(img.clientWidth / img.naturalWidth)
  }

  useEffect(() => {
    updateScale()
    const onResize = (): void => updateScale()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [question.areaImage])

  const toggle = (index: number): void => {
    if (readOnly) return
    const current = new Set(selected)
    if (current.has(index)) current.delete(index)
    else current.add(index)
    onAnswer([...current].sort((a, b) => a - b).join(','))
  }

  if (!question.areaImage) return <Html html={question.question} />

  return (
    <div className="hotarea-stage">
      <img ref={imgRef} src={areaImageSource(question.areaImage)} onLoad={updateScale} alt="hot area" />
      {question.hotAreas.map((area, index) => (
        <button
          key={index}
          type="button"
          className={`hotarea${selected.has(index + 1) ? ' selected' : ''}`}
          aria-pressed={selected.has(index + 1)}
          aria-label={`Area ${index + 1}`}
          disabled={readOnly}
          style={{
            left: area.x * scale,
            top: area.y * scale,
            width: area.width * scale,
            height: area.height * scale
          }}
          onClick={() => toggle(index + 1)}
        >
          <span className="hotarea-index">{index + 1}</span>
        </button>
      ))}
    </div>
  )
}

function slotList(answer: string, count: number): string[] {
  const parts = answer.length ? answer.split(',') : []
  return Array.from({ length: count }, (_, i) => (parts[i] ?? '').trim())
}

function serializeSlots(list: string[]): string {
  const trimmed = [...list]
  while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop()
  return trimmed.join(',')
}

/**
 * Generic placement editor for Select and Place / Create a Tree /
 * Build List and Reorder / Drop and Connect. Supports a graphic layout
 * (drop areas over an image) and a text layout (item pool + ordered slots).
 * Usable with mouse (drag or click) and keyboard (select + Enter/Delete).
 */
function PlacementView({ question, answer, onAnswer, readOnly }: QuestionViewProps): JSX.Element {
  const textItems = question.variants
  const graphicItems = question.dragAreas
  const graphic = Boolean(question.areaImage) && (graphicItems.length > 0 || question.dropAreas.length > 0)
  const itemCount = graphic ? Math.max(graphicItems.length, 1) : Math.max(textItems.length, 1)
  const slotCount = question.dropAreas.length || parseNumberSet(question.answers).length || itemCount
  const [selected, setSelected] = useState<number | null>(null)
  const assignments = slotList(answer, slotCount)

  const assign = (slot: number, item: number | null): void => {
    if (readOnly) return
    const next = slotList(answer, slotCount)
    next[slot] = item == null ? '' : String(item)
    onAnswer(serializeSlots(next))
  }

  const itemLabel = (itemNumber: number): string => choiceLetter(itemNumber - 1)

  return (
    <div>
      {question.areaImage ? (
        <div className="hotarea-stage">
          <img src={areaImageSource(question.areaImage)} alt="placement background" />
          {question.dropAreas.map((area, i) => {
            const placed = assignments[i]
            return (
              <button
                key={`drop${i}`}
                type="button"
                className={`hotarea drop${placed ? ' filled' : ''}`}
                aria-label={`Drop area ${i + 1}${placed ? `, contains ${itemLabel(Number(placed))}` : ', empty'}`}
                disabled={readOnly}
                title={`Drop area ${i + 1}`}
                style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
                onClick={() => (selected != null ? assign(i, selected) : assign(i, null))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const item = Number(e.dataTransfer.getData('text/plain'))
                  if (item > 0) assign(i, item)
                }}
              >
                <span className="hotarea-index">{i + 1}</span>
                {placed && <span className="placed-label">{itemLabel(Number(placed))}</span>}
              </button>
            )
          })}
          {graphicItems.map((area, i) => (
            <button
              key={`drag${i}`}
              type="button"
              className={`hotarea drag${selected === i + 1 ? ' selected' : ''}`}
              aria-pressed={selected === i + 1}
              aria-label={`Item ${itemLabel(i + 1)}`}
              disabled={readOnly}
              title={`Item ${itemLabel(i + 1)}`}
              style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
              onClick={() => setSelected(selected === i + 1 ? null : i + 1)}
            >
              <span className="hotarea-index">{itemLabel(i + 1)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="dnd-list" style={{ marginTop: 12 }}>
        <div className="dnd-col">
          <h4>Answer</h4>
          {Array.from({ length: slotCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`dnd-item slot${assignments[i] ? ' selected' : ''}`}
              aria-label={`Slot ${i + 1}${assignments[i] ? `, contains item ${itemLabel(Number(assignments[i]))}` : ', empty'}`}
              disabled={readOnly}
              onClick={() => (selected != null ? assign(i, selected) : assign(i, null))}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault()
                  assign(i, null)
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const item = Number(e.dataTransfer.getData('text/plain'))
                if (item > 0) assign(i, item)
              }}
            >
              <span className="hint">{i + 1}.</span> {assignments[i] ? itemLabel(Number(assignments[i])) : '(empty)'}
            </button>
          ))}
        </div>

        <div className="dnd-col">
          <h4>Choices</h4>
          <div className="dnd-pool" role="listbox" aria-label="Drag items">
            {graphic && graphicItems.length === 0
              ? null
              : Array.from({ length: itemCount }, (_, i) => {
                  const itemNumber = i + 1
                  const label = graphic ? itemLabel(itemNumber) : `${itemLabel(itemNumber)}.`
                  return (
                    <button
                      key={i}
                      type="button"
                      role="option"
                      aria-selected={selected === itemNumber}
                      className={`dnd-item${selected === itemNumber ? ' selected' : ''}`}
                      draggable={!readOnly}
                      disabled={readOnly}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(itemNumber))}
                      onClick={() => setSelected(selected === itemNumber ? null : itemNumber)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelected(selected === itemNumber ? null : itemNumber)
                        }
                      }}
                    >
                      {textItems[i] ? (
                        <>
                          <span className="choice-letter">{label}</span>
                          <span dangerouslySetInnerHTML={{ __html: textItems[i] }} />
                        </>
                      ) : (
                        <span>{label}</span>
                      )}
                    </button>
                  )
                })}
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button type="button" className="btn sm" onClick={() => onAnswer('')}>
            Reset
          </button>
          <span className="hint">
            Select a choice then click a slot, or drag a choice onto a slot. Delete clears a slot.
          </span>
        </div>
      )}
    </div>
  )
}

export default function QuestionView(props: QuestionViewProps): JSX.Element {
  const { question, showAnswer } = props
  const readOnly = props.readOnly ?? props.interactive === false
  const viewProps: QuestionViewProps = { ...props, readOnly }

  const body = useMemo(() => {
    switch (question.type) {
      case VceQuestionType.MultipleChoice:
      case VceQuestionType.SingleChoice:
      case VceQuestionType.CaseStudy:
        return <ChoiceView {...viewProps} />
      case VceQuestionType.FillInTheBlank:
        return <FillInTheBlank {...viewProps} />
      case VceQuestionType.HotArea:
      case VceQuestionType.PointAndShoot:
        return <HotAreaView {...viewProps} />
      default:
        return isPlacementType(question.type) ? (
          <PlacementView {...viewProps} />
        ) : (
          <p className="hint">Unsupported question type ({question.rawType}).</p>
        )
    }
  }, [viewProps])

  return (
    <div>
      <Html html={question.question} />
      {body}

      {showAnswer && (
        <div className="card" style={{ marginTop: 18 }}>
          <strong>Correct answer:</strong>{' '}
          {isPlacementType(question.type) || question.type === VceQuestionType.HotArea || question.type === VceQuestionType.PointAndShoot ? (
            <span>{question.answers || '(none)'}</span>
          ) : question.type === VceQuestionType.FillInTheBlank ? (
            <span>{question.blockAnswers.join(' / ') || question.answers}</span>
          ) : (
            <span>{question.answers}</span>
          )}
          {question.reference && (
            <>
              <hr />
              <Html html={question.reference} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
