import { CaretDownIcon } from "@phosphor-icons/react";

type SectionGuideProps = {
  target: `#${string}`;
  label: string;
  direction?: "down" | "up";
};

export default function SectionGuide({
  target,
  label,
  direction = "down",
}: SectionGuideProps) {
  return (
    <div className={`section-guide is-${direction}`}>
      <a
        href={target}
        aria-label={label}
        title={label}
        data-motion-item
        data-motion-kind="section-guide"
      >
        <span className="section-guide-signal" aria-hidden="true">
          <CaretDownIcon size={18} weight="bold" />
          <CaretDownIcon size={18} weight="bold" />
        </span>
      </a>
    </div>
  );
}
