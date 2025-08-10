// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { If, For } from "tsx-control-statements/components";
import { clsx } from "clsx";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { debounce, throttle } from "throttle-debounce";
import * as util from "@/util/util";
import { GlobalModel } from "@/models";

dayjs.extend(localizedFormat);

const LinesVisiblePadding = 500;

type ScreenInterface = {
    setAnchorFields(anchorLine: number, anchorOffset: number, reason: string): void;
    getSelectedLine(): number;
    getAnchor(): { anchorLine: number; anchorOffset: number };
    isLineIdInSidebar(lineId: string): boolean;
    getLineByNum(lineNum: number): LineType;
};

type LineCompFactory = (props: LineFactoryProps) => JSX.Element;

export const LinesView: React.FC<{
    screen: ScreenInterface;
    width: number;
    lines: LineInterface[];
    renderMode: RenderModeType;
    lineFactory: LineCompFactory;
}> = observer(({ screen, width, lines, renderMode, lineFactory }) => {
    const linesRef = React.useRef<HTMLDivElement>(null);
    const [staticRender, setStaticRender] = React.useState(true);
    const visibleMap = React.useRef(new Map<string, mobx.IObservableValue<boolean>>());
    const collapsedMap = React.useRef(new Map<string, mobx.IObservableValue<boolean>>());

    const computeVisibleMap = React.useCallback(
        debounce(100, () => {
            const linesElem = linesRef.current;
            if (!linesElem || linesElem.offsetParent == null || linesElem.clientHeight === 0) return;

            const lineElemArr = linesElem.querySelectorAll(".line");
            if (!lineElemArr) return;

            const containerTop = linesElem.scrollTop - LinesVisiblePadding;
            const containerBot = linesElem.scrollTop + linesElem.clientHeight + LinesVisiblePadding;
            const newMap = new Map<string, boolean>();

            lineElemArr.forEach((lineElem: HTMLElement) => {
                const lineTop = lineElem.offsetTop;
                const lineBot = lineElem.offsetTop + lineElem.offsetHeight;
                const isVis = (lineTop >= containerTop && lineTop <= containerBot) || (lineBot >= containerTop && lineBot <= containerBot);
                newMap.set(lineElem.dataset.linenum, isVis);
            });

            mobx.action(() => {
                newMap.forEach((v, k) => {
                    let oldVal = visibleMap.current.get(k);
                    if (!oldVal) {
                        oldVal = mobx.observable.box(v, { name: "lines-vis-map" });
                        visibleMap.current.set(k, oldVal);
                    }
                    if (oldVal.get() !== v) oldVal.set(v);
                });
                visibleMap.current.forEach((_, k) => {
                    if (!newMap.has(k)) visibleMap.current.delete(k);
                });
            })();
        }),
        []
    );

    const computeAnchorLine = React.useCallback(
        throttle(100, () => {
            const linesElem = linesRef.current;
            if (!linesElem) {
                screen.setAnchorFields(null, 0, "no-lines");
                return;
            }
            const lineElemArr = linesElem.querySelectorAll(".line");
            if (!lineElemArr.length) {
                screen.setAnchorFields(null, 0, "no-line");
                return;
            }
            const inputAtTop = GlobalModel.inputPosition.get() === "top";
            const scrollTop = linesElem.scrollTop;
            const height = linesElem.clientHeight;
            const containerBottom = scrollTop + height;
            let anchorElem: HTMLElement = null;

            if (inputAtTop) {
                for (let i = 0; i < lineElemArr.length; i++) {
                    const lineElem = lineElemArr[i] as HTMLElement;
                    if (lineElem.offsetTop + lineElem.offsetHeight >= scrollTop) {
                        anchorElem = lineElem;
                        break;
                    }
                }
            } else {
                for (let i = lineElemArr.length - 1; i >= 0; i--) {
                    const lineElem = lineElemArr[i] as HTMLElement;
                    if (lineElem.offsetTop + lineElem.offsetHeight <= containerBottom || lineElem.offsetTop <= scrollTop) {
                        anchorElem = lineElem;
                        break;
                    }
                }
            }
            anchorElem = anchorElem ?? (lineElemArr[0] as HTMLElement);
            const anchorLineNum = parseInt(anchorElem.dataset.linenum);
            const anchorOffset = containerBottom - (anchorElem.offsetTop + anchorElem.offsetHeight);
            screen.setAnchorFields(anchorLineNum, anchorOffset, "computeAnchorLine");
        }, { noLeading: true, noTrailing: false }),
        [screen]
    );

    // ... (rest of the logic)

    return (
        <div
            className={clsx("lines", renderMode === "normal" ? "lines-expanded" : "lines-collapsed", "wide-scrollbar", {
                "input-at-top": GlobalModel.inputPosition.get() === "top",
                "thread-mode": GlobalModel.isThreadMode.get(),
            })}
            onScroll={computeVisibleMap}
            ref={linesRef}
        >
            <div className="lines-spacer" />
            {/* ... render lines */}
        </div>
    );
});