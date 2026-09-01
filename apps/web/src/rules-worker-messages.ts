import type { CharacterBuild } from "@4ecb/character-domain";
import type {
  EvaluatedCharacter,
  EvaluationInput,
  ProfileMigrationPreview,
} from "@4ecb/rules-engine";

export type RulesWorkerRequest =
  | {
      readonly type: "initialize";
      readonly requestId: number;
      readonly packId: string;
    }
  | {
      readonly type: "evaluate";
      readonly requestId: number;
      readonly input: EvaluationInput;
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
      readonly recordCount: number;
    }
  | {
      readonly type: "evaluation";
      readonly requestId: number;
      readonly result: EvaluatedCharacter;
      readonly elapsedMilliseconds: number;
    }
  | {
      readonly type: "profile-migration-preview";
      readonly requestId: number;
      readonly result: ProfileMigrationPreview;
      readonly elapsedMilliseconds: number;
    }
  | {
      readonly type: "error";
      readonly requestId: number;
      readonly message: string;
    };
