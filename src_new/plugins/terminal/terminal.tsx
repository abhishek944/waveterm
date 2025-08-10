// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { If } from "tsx-control-statements/components";
import { GlobalModel } from "@/models";
import { termHeightFromRows } from "@/utils/textmeasure";
import { clsx } from "clsx";
import * as lineutil from "@/components/line/lineutil";

dayjs.extend(localizedFormat);

const TerminalKeybindings: React.FC<{ termWrap: any; lineid: string }> = ({ termWrap, lineid }) => {
    React.useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;
        const domain = `line-${lineid}`;

        keybindManager.registerKeybinding("plugin", domain, "terminal:copy", () => {
            const sel = termWrap.terminal.getSelection();
            navigator.clipboard.writeText(sel);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "terminal:paste", () => {
            navigator.clipboard.readText().then((text) => {
                termWrap.dataHandler?.(text, termWrap);
            });
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectAbove", () => {
            termWrap.terminal.scrollLines(-1);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectBelow", () => {
            termWrap.terminal.scrollLines(1);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectPageAbove", () => {
            termWrap.terminal.scrollLines(-10);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectPageBelow", () => {
            termWrap.terminal.scrollLines(10);
            return true;
        });

        keybindManager.unregisterDomain(domain);
    }, [termWrap, lineid]);

    return null;
};

export const TerminalRenderer: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    staticRender: boolean;
    visible: OV<boolean>;
    onHeightChange: () => void;
    collapsed: boolean;
}> = observer(({ screen, line, width, staticRender, visible, onHeightChange, collapsed }) => {
    const [termLoaded, setTermLoaded] = React.useState(false);
    const elemRef = React.useRef<HTMLDivElement>(null);
    const termRef = React.useRef<HTMLDivElement>(null);

    const unloadTerminal = React.useCallback(
        (unmount: boolean) => {
            screen.unloadRenderer(line.lineid);
            if (!unmount) {
                setTermLoaded(false);
                if (termRef.current) {
                    termRef.current.replaceChildren();
                }
            }
        },
        [screen, line.lineid]
    );

    const loadTerminal = React.useCallback(() => {
        const cmd = screen.getCmd(line);
        if (cmd == null || termRef.current == null) {
            return;
        }
        screen.loadTerminalRenderer(termRef.current, line, cmd, width);
        setTermLoaded(true);
    }, [screen, line, width]);

    React.useEffect(() => {
        if (!staticRender) {
            const vis = visible && !collapsed;
            if (vis && !termLoaded) {
                loadTerminal();
            } else if (!vis && termLoaded) {
                unloadTerminal(false);
            }
        }
    }, [staticRender, visible, collapsed, termLoaded, loadTerminal, unloadTerminal]);

    React.useEffect(() => {
        return () => {
            if (termLoaded) {
                unloadTerminal(true);
            }
        };
    }, [termLoaded, unloadTerminal]);

    React.useEffect(() => {
        if (onHeightChange) {
            const observer = new ResizeObserver(() => onHeightChange());
            if (elemRef.current) {
                observer.observe(elemRef.current);
            }
            return () => observer.disconnect();
        }
    }, [onHeightChange]);

    const clickTermBlock = () => {
        const termWrap = screen.getTermWrap(line.lineid);
        if (termWrap != null) {
            termWrap.giveFocus();
        }
    };

    const isPhysicalFocused = mobx.computed(() => screen.getIsFocused(line.linenum)).get();
    const isFocused = mobx.computed(() => isPhysicalFocused && screen.getFocusType() === "cmd").get();
    const cmd = screen.getCmd(line);
    const usedRows = screen.getUsedRows(lineutil.getRendererContext(line), line, cmd, width);
    let termHeight = termHeightFromRows(usedRows, GlobalModel.getTermFontSize(), cmd.getTermMaxRows());
    if (usedRows === 0) {
        termHeight = 0;
    }
    const termWrap = screen.getTermWrap(line.lineid);

    return (
        <div
            ref={elemRef}
            className={clsx(
                "terminal-wrapper",
                { "focus": isFocused, "cmd-done": !cmd.isRunning(), "h-0": termHeight === 0, "collapsed": collapsed }
            )}
            data-usedrows={usedRows}
        >
            <If condition={!isFocused}>
                <div className="term-block" onClick={clickTermBlock} />
            </If>
            <If condition={isFocused}>
                <TerminalKeybindings termWrap={termWrap} lineid={line.lineid} />
            </If>
            <div
                className="terminal-connectelem"
                ref={termRef}
                data-lineid={line.lineid}
                style={{ height: termHeight }}
            />
            <If condition={!termLoaded}>
                <div className="terminal-loading-message">...</div>
            </If>
        </div>
    );
});