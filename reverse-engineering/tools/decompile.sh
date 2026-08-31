#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:?usage: decompile.sh REPOSITORY_ROOT ILSPY_DLL}"
ilspy_dll="${2:?usage: decompile.sh REPOSITORY_ROOT ILSPY_DLL}"
input_dir="$repo_root/CharacterBuilder"
output_root="$repo_root/reverse-engineering/generated/decompiled"

assemblies=(
  ApplicationUpdate.Client.dll
  CharacterBuilder.exe
  CharacterBuilderUpdater.exe
  CharacterSheetViewer.exe
  D20RulesEngine.dll
  DDICharacterInterchange.dll
  DataBinding.dll
  Elevator.exe
  RealCharacterBuilderUpdater.exe
  RegPatcher.exe
  RulesEngineCommon.dll
  Solid.Patcher.dll
  XAMLUtilities.dll
)

mkdir -p "$output_root"
for assembly in "${assemblies[@]}"; do
  name="${assembly%.*}"
  destination="$output_root/$name"
  mkdir -p "$destination"
  dotnet "$ilspy_dll" \
    --disable-updatecheck \
    --nested-directories \
    --project \
    --referencepath "$input_dir" \
    --outputdir "$destination" \
    "$input_dir/$assembly"
done

