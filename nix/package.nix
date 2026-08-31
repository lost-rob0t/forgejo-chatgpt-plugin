{ lib, stdenvNoCC, makeWrapper, nodejs_24 }:

stdenvNoCC.mkDerivation {
  pname = "forgejo-chatgpt-plugin";
  version = "0.2.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let
        base = baseNameOf path;
      in
      base != ".git" && base != "result" && base != "node_modules";
  };

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;
  dontConfigure = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib/forgejo-chatgpt-plugin" "$out/bin"
    cp -r src "$out/lib/forgejo-chatgpt-plugin/"

    makeWrapper ${nodejs_24}/bin/node "$out/bin/forgejo-chatgpt-plugin" \
      --add-flags "$out/lib/forgejo-chatgpt-plugin/src/index.mjs"

    runHook postInstall
  '';

  meta = {
    description = "Read-write Forgejo MCP server for ChatGPT custom apps";
    homepage = "https://github.com/lost-rob0t/forgejo-chatgpt-plugin";
    license = lib.licenses.agpl3Only;
    mainProgram = "forgejo-chatgpt-plugin";
    platforms = lib.platforms.linux;
  };
}
