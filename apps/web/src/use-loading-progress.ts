import { useEffect, useState } from "react";

import { appContentRuntime, type RulesRuntimeClient } from "./app-runtime";

/**
 * Objective progress for the character loading screens, as whole-number
 * percentages: bytes of the page's content pack decoded, bytes of the rules
 * worker's copy decoded, and evaluation work items (one per earlier level,
 * plus the final pass) across the worker's in-flight batch.
 */
export interface LoadingProgress {
  readonly packPercent: number | undefined;
  readonly rulesContentPercent: number | undefined;
  readonly rulesContentReady: boolean;
  readonly evaluationPercent: number | undefined;
}

const IDLE: LoadingProgress = {
  packPercent: undefined,
  rulesContentPercent: undefined,
  rulesContentReady: false,
  evaluationPercent: undefined,
};

// The JSON parse after the last byte is decoded can't report progress, so a
// pack holds at 99% until it actually resolves.
const decodedPercent = (completed: number, total: number) =>
  Math.min(99, Math.floor((100 * completed) / total));

const atLeast = (current: number | undefined, next: number) =>
  current === undefined ? next : Math.max(current, next);

export function useLoadingProgress(
  packId: string | undefined,
  client: RulesRuntimeClient | undefined,
  enabled: boolean,
): LoadingProgress {
  const [progress, setProgress] = useState<LoadingProgress>(IDLE);
  useEffect(() => {
    setProgress(IDLE);
    if (!enabled) return;
    const unsubscribePack =
      packId === undefined
        ? undefined
        : appContentRuntime.subscribePackProgress(
            packId,
            ({ completed, total }) => {
              if (total <= 0) return;
              setProgress((current) => ({
                ...current,
                packPercent: atLeast(
                  current.packPercent,
                  decodedPercent(completed, total),
                ),
              }));
            },
          );
    const unsubscribeRules = client?.subscribeProgress?.(
      ({ content, evaluation }) =>
        setProgress((current) => ({
          ...current,
          rulesContentReady: content?.ready ?? false,
          rulesContentPercent:
            content === undefined || content.total <= 0
              ? current.rulesContentPercent
              : content.ready
                ? 100
                : atLeast(
                    current.rulesContentPercent,
                    decodedPercent(content.completed, content.total),
                  ),
          // An idle worker ends the batch; the next one starts from 0.
          evaluationPercent:
            evaluation === undefined || evaluation.total <= 0
              ? undefined
              : atLeast(
                  current.evaluationPercent,
                  Math.floor((100 * evaluation.completed) / evaluation.total),
                ),
        })),
    );
    return () => {
      unsubscribePack?.();
      unsubscribeRules?.();
    };
  }, [packId, client, enabled]);
  return progress;
}

const LOADING_STEPS = [
  "Opening game content",
  "Preparing rules engine",
  "Evaluating rules",
] as const;

/**
 * "(2/3) Preparing rules engine (45%)". `contentOpened` is whether the page
 * has its own copy of the content; the worker steps follow it.
 */
export function loadingStepDetail(
  contentOpened: boolean,
  progress: LoadingProgress,
): string {
  const [step, percent] = !contentOpened
    ? [1, progress.packPercent]
    : !progress.rulesContentReady
      ? [2, progress.rulesContentPercent]
      : [3, progress.evaluationPercent];
  return `(${step}/${LOADING_STEPS.length}) ${LOADING_STEPS[step - 1]}${
    percent === undefined ? "" : ` (${percent}%)`
  }`;
}
