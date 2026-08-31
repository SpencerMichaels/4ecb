import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CompendiumQuery,
  CompendiumQueryResult,
  EntityRelationships,
} from "@4ecb/query-engine";

export type QueryWorkerRequest =
  | {
      readonly type: "initialize";
      readonly requestId: number;
      readonly packId: string;
    }
  | {
      readonly type: "query";
      readonly requestId: number;
      readonly query: CompendiumQuery;
    }
  | {
      readonly type: "get-entity";
      readonly requestId: number;
      readonly entityId: string;
    }
  | {
      readonly type: "get-relationships";
      readonly requestId: number;
      readonly entityId: string;
    };

export type QueryWorkerResponse =
  | {
      readonly type: "progress";
      readonly requestId: number;
      readonly phase: "loading-pack" | "building-index";
      readonly recordCount?: number;
    }
  | {
      readonly type: "initialized";
      readonly requestId: number;
      readonly packId: string;
      readonly contentDigest: string;
      readonly recordCount: number;
      readonly elapsedMilliseconds: number;
    }
  | {
      readonly type: "query-result";
      readonly requestId: number;
      readonly result: CompendiumQueryResult;
    }
  | {
      readonly type: "entity-result";
      readonly requestId: number;
      readonly entity?: ContentEntity;
    }
  | {
      readonly type: "relationships-result";
      readonly requestId: number;
      readonly relationships?: EntityRelationships;
    }
  | {
      readonly type: "error";
      readonly requestId: number;
      readonly message: string;
    };
