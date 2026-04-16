import tw from "twin.macro";

const Wrapper = tw.div`w-full`;
const Header = tw.div`flex items-center justify-between gap-4`;
const Label = tw.span`text-sm font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]`;
const Value = tw.span`font-mono text-sm text-[var(--color-ink)]`;
const Track = tw.div`mt-4 h-4 w-full overflow-hidden rounded-full bg-[var(--color-progress-track)]`;
const Fill = tw.div`h-full rounded-full`;

export default function ProgressBar({ percentage }) {
  return (
    <Wrapper>
      <Header>
        <Label>Completion</Label>
        <Value>{percentage}%</Value>
      </Header>

      <Track>
        <Fill
          className="dashboard-progress-bar"
          style={{ width: `${percentage}%` }}
        />
      </Track>
    </Wrapper>
  );
}
