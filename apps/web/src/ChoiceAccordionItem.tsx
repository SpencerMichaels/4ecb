import type { ReactNode } from "react";

import { Icon } from "./Icon";

export type ChoiceAccordionStatus = "complete" | "unresolved" | "house-rule";

/**
 * One fold of a one-open-at-a-time accordion: a heading row (title, current
 * picks, status) that shows its content only while open. The open item can
 * always be closed again.
 */
export function ChoiceAccordionItem({
  open,
  title,
  picks,
  status,
  onToggle,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly picks: string;
  readonly status?: ChoiceAccordionStatus | undefined;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`choice-accordion-item${open ? " is-open" : ""}${status === "unresolved" ? " is-unresolved" : ""}`}
    >
      <h4 className="choice-accordion-heading">
        <button aria-expanded={open} type="button" onClick={onToggle}>
          <Icon name="chevron" />
          <span className="choice-accordion-title">{title}</span>
          <span className="choice-accordion-picks">{picks}</span>
          <span
            className={`choice-accordion-status${status === "house-rule" ? " is-house-rule" : ""}`}
          >
            {status === "house-rule" ? (
              <>
                <Icon name="house" />
                <span className="visually-hidden">House rule</span>
              </>
            ) : status === "unresolved" ? (
              <>
                <Icon name="circle-help" />
                <span className="visually-hidden">Incomplete</span>
              </>
            ) : status === "complete" ? (
              <>
                <Icon name="check" />
                <span className="visually-hidden">Complete</span>
              </>
            ) : null}
          </span>
        </button>
      </h4>
      {open ? children : null}
    </div>
  );
}
