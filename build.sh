#!/bin/bash

deno compile \
    --target x86_64-pc-windows-msvc \
    --output pixel-socket.exe \
    --icon pixel-socket.ico \
    --allow-net \
    --allow-write="./images" \
    app.ts
echo "Build complete: pixel-socket.exe"
