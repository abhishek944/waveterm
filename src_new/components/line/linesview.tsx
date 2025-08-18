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
import * as util from "@/utils/util";
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

    const anchor = React.useMemo(() => {
        const { anchorLine, anchorOffset } = screen.getAnchor();
        if (!anchorLine || anchorLine === 0) {
            return {
                anchorLine: lines[lines.length - 1]?.linenum || 0,
                anchorOffset: 0,
                anchorIndex: lines.length - 1,
            };
        }
        const lineIndex = lines.findIndex((line) => line.linenum >= anchorLine);
        if (lineIndex === -1) {
            return {
                anchorLine: lines[lines.length - 1]?.linenum || 0,
                anchorOffset: 0,
                anchorIndex: lines.length - 1,
            };
        }
        return {
            anchorLine: lines[lineIndex].linenum,
            anchorOffset: lines[lineIndex].linenum === anchorLine ? anchorOffset : 0,
            anchorIndex: lineIndex,
        };
    }, [screen, lines]);

    const lineElements = React.useMemo(() => {
        const elements = [];
        const startIdx = Math.max(0, anchor.anchorIndex - 50);
        const endIdx = Math.min(lines.length - 1, anchor.anchorIndex + 50);

        for (let idx = startIdx; idx <= endIdx; idx++) {
            const line = lines[idx];
            const lineNumStr = String(line.linenum);
            

            // Get or create visibility observable
            if (!visibleMap.current.has(lineNumStr)) {
                visibleMap.current.set(lineNumStr, mobx.observable.box(false, { name: "lines-vis-map" }));
            }
            if (!collapsedMap.current.has(lineNumStr)) {
                collapsedMap.current.set(lineNumStr, mobx.observable.box(false, { name: "lines-collapsed-map" }));
            }

            const lineProps = {
                key: line.lineid,
                line,
                width,
                visible: visibleMap.current.get(lineNumStr),
                staticRender,
                onHeightChange: () => {}, // TODO: implement height change handler
                overrideCollapsed: collapsedMap.current.get(lineNumStr),
                topBorder: false, // TODO: implement hasTopBorder logic
                renderMode,
            };

            elements.push(lineFactory(lineProps));
        }
        return elements;
    }, [lines, anchor, width, staticRender, renderMode, lineFactory]);


    return (
        <div
            className={clsx(
                "flex flex-col p-0 flex-grow relative overflow-x-hidden flex-shrink-0",
                renderMode === "normal" ? "lines-expanded" : "lines-collapsed",
                {
                    "pt-[calc(var(--termpad)+2px)] pb-[calc(var(--termlineheight)*2)]": GlobalModel.inputPosition.get() === "top",
                    "pb-[calc(var(--termlineheight)*2)]": GlobalModel.inputPosition.get() !== "top",
                    "hide-scrollbar": false, // TODO: implement hide scrollbar logic
                }
            )}
            ref={linesRef}
        >
            <div className="flex-grow" />
            {lineElements}
        </div>
    );
});