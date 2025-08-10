// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as mobx from "mobx";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { sprintf } from "sprintf-js";
import { App } from "./app";
import * as DOMPurify from "dompurify";
// TODO: Migrate fontutil and textmeasure utilities
// import { loadFonts } from "@/utils/fontutil";
// import * as textmeasure from "@/utils/textmeasure";

// @ts-ignore
let VERSION = __WAVETERM_VERSION__;
// @ts-ignore
let BUILD = __WAVETERM_BUILD__;

// TODO: Re-enable when fontutil is migrated
// loadFonts();

document.addEventListener("DOMContentLoaded", () => {
    let reactElem = React.createElement(App, null, null);
    let elem = document.getElementById("app");
    let root = createRoot(elem);
    document.fonts.ready.then(() => {
        root.render(reactElem);
    });
});

// put some items on the window for debugging
(window as any).mobx = mobx;
(window as any).sprintf = sprintf;
(window as any).DOMPurify = DOMPurify;
// TODO: Re-enable when textmeasure is migrated
// (window as any).textmeasure = textmeasure;

console.log("WaveTerm", VERSION, BUILD);