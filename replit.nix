{pkgs}: {
  deps = [
    pkgs.libGL
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.unzip
  ];
}
