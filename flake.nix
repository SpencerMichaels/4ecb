{
  description = "Project-local toolchain for the modern D&D 4E character builder";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          dotnet-sdk_8
          docker-client
          jq
          libxml2
          nodejs_24
          pnpm
          python313
          ripgrep
          xmlstarlet
        ];

        DOTNET_CLI_TELEMETRY_OPTOUT = "1";
        DOTNET_NOLOGO = "1";
        PNPM_HOME = "${toString ./.pnpm-home}";
      };
    };
}
