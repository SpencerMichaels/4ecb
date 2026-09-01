import type { EvaluatedCharacter, EvaluationInput } from "@4ecb/rules-engine";

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
      readonly type: "error";
      readonly requestId: number;
      readonly message: string;
    };
