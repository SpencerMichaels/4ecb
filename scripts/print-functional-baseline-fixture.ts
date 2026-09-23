import { createFunctionalBaselineFixture } from "../apps/web/src/functional-baseline-fixture";

const fixture = await createFunctionalBaselineFixture();
process.stdout.write(`${JSON.stringify(fixture)}\n`);
