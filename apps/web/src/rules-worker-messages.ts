import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type {
  EvaluatedCharacter,
  EvaluationInput,
  ProfileMigrationPreview,
} from "@4ecb/rules-engine";

import type { LibrarySummaryValue } from "./library-summary";

/**
 * A migration preview's current step: decoding both packs (bytes), then
 * evaluating with the new content and the old (work items each).
 */
export interface ProfileMigrationPreviewProgress {
  readonly step: "content" | "target" | "source";
  /** Whether the old content will be evaluated too (a third step). */
  readonly sourceAvailable: boolean;
  readonly completed: number;
  readonly total: number;
}

export type RulesWorkerRequest =
  | {
      readonly type: "initialize";
      readonly requestId: number;
      readonly packId: string;
      readonly contentDigest?: string;
    }
  | {
      readonly type: "evaluate";
      readonly requestId: number;
      readonly input: EvaluationInput;
    }
  | {
      /** Evaluates a stored character and returns only its library summary,
       *  so the library never decodes content on the main thread. */
      readonly type: "library-summary";
      readonly requestId: number;
      readonly snapshot: LegacyCharacterSnapshot;
      readonly build: CharacterBuild;
    }
  | {
      readonly type: "preview-profile-migration";
      readonly requestId: number;
      readonly build: CharacterBuild;
      readonly sourcePackId?: string;
      readonly sourceContentDigest?: string;
      readonly targetPackId: string;
    };

export type RulesWorkerResponse =
  | {
      readonly type: "initialized";
      readonly requestId: number;
      readonly packId: string;
      readonly contentDigest: string;
      readonly recordCount: number;
    }
  | {
      readonly type: "evaluation";
      readonly requestId: number;
      readonly result: EvaluatedCharacter;
      readonly elapsedMilliseconds: number;
      readonly contentLoadMilliseconds: number;
      readonly evaluationMilliseconds: number;
    }
  | {
      /** Broadcast while the worker decodes its content pack; not a reply. */
      readonly type: "content-progress";
      readonly completed: number;
      readonly total: number;
      readonly ready: boolean;
    }
  | {
      /** Interim update for a pending evaluate request; not a reply. */
      readonly type: "evaluation-progress";
      readonly requestId: number;
      readonly completed: number;
      readonly total: number;
    }
  | {
      /** Interim update for a pending migration preview; not a reply. */
      readonly type: "profile-migration-progress";
      readonly requestId: number;
      readonly progress: ProfileMigrationPreviewProgress;
    }
  | {
      readonly type: "profile-migration-preview";
      readonly requestId: number;
      readonly result: ProfileMigrationPreview;
      readonly elapsedMilliseconds: number;
    }
  | {
      readonly type: "library-summary";
      readonly requestId: number;
      readonly result: LibrarySummaryValue;
    }
  | {
      readonly type: "error";
      readonly requestId: number;
      readonly message: string;
    };
