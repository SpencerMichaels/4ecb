import { buildInfo } from "./build-info";

/** A quiet line naming the running build: commit hash and build date. */
export function BuildVersion() {
  const built =
    buildInfo.date === undefined ? undefined : new Date(buildInfo.date);
  return (
    <p className="build-version">
      Version {buildInfo.commit}
      {built === undefined ? null : (
        <>
          {" · built "}
          <time dateTime={buildInfo.date} title={built.toLocaleString()}>
            {built.toLocaleDateString(undefined, { dateStyle: "medium" })}
          </time>
        </>
      )}
    </p>
  );
}
