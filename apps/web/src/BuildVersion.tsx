import { buildInfo } from "./build-info";
import { DotList } from "./DotList";

/** A quiet line naming the running build: commit hash and build date. */
export function BuildVersion() {
  const built =
    buildInfo.date === undefined ? undefined : new Date(buildInfo.date);
  return (
    <p className="build-version">
      <DotList
        items={[
          `Version ${buildInfo.commit}`,
          built === undefined ? undefined : (
            <>
              built{" "}
              <time dateTime={buildInfo.date} title={built.toLocaleString()}>
                {built.toLocaleDateString(undefined, { dateStyle: "medium" })}
              </time>
            </>
          ),
        ]}
      />
    </p>
  );
}
