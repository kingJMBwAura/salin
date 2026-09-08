import type { ConversionPlan, PlanLeg, StreamAction } from '@shared/types'

/**
 * The app's signature: a conversion drawn as a circuit run.
 *
 * One line per stream, with the codec change sitting on the trace like a
 * component on a board. Mint means the stream is carried across untouched;
 * cyan means it is being rebuilt, and while the job is actually running the
 * cyan legs carry a highlight travelling along them.
 *
 * This exists so the difference the whole app turns on — copying versus
 * re-encoding — is legible before you read a word of the description.
 */

const ACTION_LABEL: Record<StreamAction, string> = {
  copy: 'copy',
  encode: 'encode',
  drop: 'dropped'
}

const ACTION_TONE: Record<StreamAction, string> = {
  copy: 'text-mint border-mint/30 bg-mint/10',
  encode: 'text-neon border-neon/30 bg-neon/10',
  drop: 'text-faint border-line2 bg-raised'
}

function Row({ label, leg, live }: { label: string; leg: PlanLeg; live: boolean }): JSX.Element {
  const dropped = leg.action === 'drop'
  const action = dropped ? undefined : leg.action
  // Only a leg that is genuinely working animates; a copy finishes too fast to
  // watch and a dropped stream does nothing at all.
  const running = live && leg.action === 'encode'

  return (
    <div className="flex items-center gap-2.5">
      <span className="eyebrow w-[68px] shrink-0">{label}</span>
      <span className="trace-node" data-action={action} aria-hidden="true" />
      <span className="trace-leg" data-action={action} data-live={running} aria-hidden="true" />
      <span
        className={`shrink-0 whitespace-nowrap font-mono text-[11px] ${
          dropped ? 'text-faint' : 'text-muted'
        }`}
      >
        {dropped ? '—' : leg.from === leg.to ? leg.from : `${leg.from} → ${leg.to}`}
      </span>
      <span className="trace-leg" data-action={action} data-live={running} aria-hidden="true" />
      <span className="trace-node" data-action={action} aria-hidden="true" />
      <span
        className={`w-[62px] shrink-0 rounded-full border px-1.5 py-0.5 text-center font-mono
                    text-[10px] uppercase tracking-[0.08em] ${ACTION_TONE[leg.action]}`}
      >
        {ACTION_LABEL[leg.action]}
      </span>
    </div>
  )
}

export function VerdictBadge({ plan }: { plan: ConversionPlan }): JSX.Element {
  const remux = plan.mode === 'remux'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono
                  text-[10.5px] uppercase tracking-[0.12em] ${
                    remux
                      ? 'border-mint/30 bg-mint/10 text-mint'
                      : 'border-neon/30 bg-neon/10 text-neon'
                  }`}
    >
      {remux ? 'Remux · seconds' : 'Re-encode'}
    </span>
  )
}

export default function PipelineTrace({
  plan,
  live = false
}: {
  plan: ConversionPlan
  live?: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Row label="Video" leg={plan.video} live={live} />
      <Row label="Audio" leg={plan.audio} live={live} />
      <Row label="Subtitles" leg={plan.subtitles} live={live} />
    </div>
  )
}
