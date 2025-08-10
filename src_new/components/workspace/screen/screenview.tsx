// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { If } from "tsx-control-statements/components";
import { clsx } from "clsx";
import { debounce } from "throttle-debounce";
import dayjs from "dayjs";
import { GlobalCommandRunner, ForwardLineContainer, GlobalModel, ScreenLines, Screen, Session } from "@/models";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { Line } from "@/components/line/linecomps";
import { LinesView } from "@/components/line/linesview";
import * as util from "@/utils/util";
import * as appconst from "@/app/appconst";
import * as textmeasure from "@/utils/textmeasure";
import { MagicLayout } from "@/components/ui/magiclayout";
import { Button } from "@/components/ui/button";

dayjs.extend(localizedFormat);

const ScreenSidebar: React.FC<{ screen: Screen; width: string }> = observer(({ screen, width }) => {
    const sidebarRef = React.useRef<HTMLDivElement>(null);
    const [sidebarSize, setSidebarSize] = React.useState<WindowSize>({ height: 0, width: 0 });

    const handleResize = React.useCallback(
        debounce(100, (entries: ResizeObserverEntry[]) => {
            const sidebarElem = sidebarRef.current;
            if (sidebarElem) {
                const newSize = {
                    width: sidebarElem.offsetWidth,
                    height:
                        sidebarElem.offsetHeight -
                        textmeasure.calcMaxLineChromeHeight(GlobalModel.lineHeightEnv) -
                        MagicLayout.ScreenSidebarHeaderHeight,
                };
                setSidebarSize(newSize);
            }
        }),
        []
    );

    React.useEffect(() => {
        const rszObs = new ResizeObserver(handleResize);
        if (sidebarRef.current) {
            rszObs.observe(sidebarRef.current);
            handleResize([]);
        }
        return () => rszObs.disconnect();
    }, [handleResize]);

    const sidebarClose = () => GlobalCommandRunner.screenSidebarClose();
    const sidebarOpenHalf = () => GlobalCommandRunner.screenSidebarOpen("50%");
    const sidebarOpenPartial = () => GlobalCommandRunner.screenSidebarOpen("500px");

    const sidebar = screen.viewOpts.get()?.sidebar;
    const lineId = sidebar?.sidebarlineid;
    const sidebarOk = sidebarSize.width > 0 && !util.isBlank(lineId);

    return (
        <div className="absolute top-0 right-0 flex flex-col h-full overflow-y-auto border-l border-gray-700 transition-width duration-500 ease-in-out" style={{ width }} ref={sidebarRef}>
            <div className="flex flex-row px-0 py-1 border-b border-gray-700 text-sm font-mono leading-6 text-gray-400 hover:text-white">
                <div className="invisible group-hover:visible ml-2">sidebar</div>
                <div className="flex-spacer" />
                <div onClick={sidebarOpenHalf} title="Set Sidebar Width to 50%" className="p-1 cursor-pointer">
                    <i className="fa-sharp fa-solid fa-table-columns" />
                </div>
                <div onClick={sidebarOpenPartial} title="Set Sidebar Width to 500px" className="p-1 cursor-pointer">
                    <i className="fa-sharp fa-solid fa-sidebar-flip" />
                </div>
                <div onClick={sidebarClose} className="ml-1 mr-2.5 p-1 cursor-pointer">
                    <i className="fa-sharp fa-solid fa-xmark-large" />
                </div>
            </div>
            <If condition={!sidebarOk}>
                <div className="self-center mt-[20%]">
                    <div className="font-bold">No Sidebar Line Selected</div>
                    <div className="mt-5 p-2 bg-gray-800 rounded font-mono">
                        /sidebar:open [width=[50%|500px]]
                        <br />
                        /sidebar:close
                        <br />
                        /sidebar:add line=[linenum]
                    </div>
                    <div className="flex flex-col items-center justify-center mt-5 mb-2.5">
                        <Button className="secondary" onClick={sidebarClose}>
                            Close Sidebar
                        </Button>
                    </div>
                </div>
            </If>
            <If condition={sidebarOk}>
                <SidebarLineContainer key={lineId} screen={screen} winSize={sidebarSize} lineId={lineId} />
            </If>
        </div>
    );
});

const SidebarLineContainer: React.FC<{ screen: Screen; winSize: WindowSize; lineId: string }> = observer(
    ({ screen, winSize, lineId }) => {
        const [container, setContainer] = React.useState<ForwardLineContainer | null>(null);
        const [ready, setReady] = React.useState(false);
        const overrideCollapsed = React.useRef(mobx.observable.box(false, { name: "overrideCollapsed" }));
        const visible = React.useRef(mobx.observable.box(true, { name: "visible" }));

        React.useEffect(() => {
            const timeoutId = setTimeout(() => {
                mobx.action(() => {
                    setContainer(new ForwardLineContainer(screen, winSize, appconst.LineContainer_Sidebar, lineId));
                    setReady(true);
                })();
            }, 100);
            return () => clearTimeout(timeoutId);
        }, [screen, winSize, lineId]);

        React.useEffect(() => {
            if (container) {
                container.screenSizeCallback(mobx.toJS(winSize));
            }
        }, [winSize, container]);

        if (!ready || !container) {
            return null;
        }

        const line = screen.getLineById(lineId);
        if (!line) {
            return null;
        }

        return (
            <Line
                screen={container}
                line={line}
                width={winSize.width}
                staticRender={false}
                visible={visible.current}
                onHeightChange={() => {}}
                overrideCollapsed={overrideCollapsed.current}
                topBorder={false}
                renderMode="normal"
                noSelect={true}
            />
        );
    }
);

const ScreenWindowView: React.FC<{ session: Session; screen: Screen; width: string }> = observer(
    ({ session, screen, width }) => {
        const windowViewRef = React.useRef<HTMLDivElement>(null);
        const [size, setSize] = React.useState({ width: 0, height: 0 });
        const [renderMode, setRenderMode] = React.useState<RenderModeType>("normal");
        const [shareCopied, setShareCopied] = React.useState(false);

        const setSize_debounced = React.useCallback(
            debounce(1000, (newWidth: number, newHeight: number) => {
                if (screen && newWidth > 0 && newHeight > 0) {
                    mobx.action(() => {
                        setSize({ width: newWidth, height: newHeight });
                        screen.screenSizeCallback({ height: newHeight, width: newWidth });
                    })();
                }
            }),
            [screen]
        );

        React.useEffect(() => {
            const wvElem = windowViewRef.current;
            if (wvElem) {
                const rszObs = new ResizeObserver((entries) => {
                    if (entries.length > 0) {
                        const entry = entries[0];
                        setSize_debounced((entry.target as HTMLElement).offsetWidth, (entry.target as HTMLElement).offsetHeight);
                    }
                });
                rszObs.observe(wvElem);
                setSize_debounced(wvElem.offsetWidth, wvElem.offsetHeight);
                if (screen.isNew) {
                    screen.isNew = false;
                    mobx.action(() => GlobalModel.tabSettingsOpen.set(true))();
                }
                return () => rszObs.disconnect();
            }
        }, [setSize_debounced, screen]);

        const getScreenLines = (): ScreenLines => {
            let win = GlobalModel.getScreenLinesById(screen.screenId);
            if (!win) {
                win = GlobalModel.loadScreenLines(screen.screenId);
            }
            return win;
        };

        const renderError = (message: string, fade: boolean) => (
            <div className="flex flex-col absolute h-full overflow-x-hidden" ref={windowViewRef} data-screenid={screen.screenId} style={{ width }}>
                <div className="lines" />
                <div className={clsx("flex items-center justify-center w-full p-2.5 h-full text-main", { "opacity-100 animate-fade-in": fade })}>
                    <div>{message}</div>
                </div>
            </div>
        );

        const buildLineComponent = (lineProps: LineFactoryProps): React.JSX.Element => {
            const { line, ...restProps } = lineProps;
            return <Line key={(line as LineType).lineid} screen={screen} line={line as LineType} {...restProps} />;
        };

        const determineVisibleLines = (win: ScreenLines): LineType[] => {
            const lines = screen.filterRunning.get() ? win.getRunningCmdLines() : win.getNonArchivedLines();
            return GlobalModel.inputPosition.get() === "top" ? lines.slice().reverse() : lines;
        };

        const disableFilter = () => mobx.action(() => screen.filterRunning.set(false))();

        const win = getScreenLines();
        if (!win.loaded.get()) return renderError("...", true);
        if (win.loadError.get()) return renderError(`(${win.loadError.get()})`, false);
        if (size.width === 0) return renderError("", false);
        if (!GlobalModel.clientData.get()) return renderError("loading client data", true);

        const lines = determineVisibleLines(win);

        return (
            <div className="flex flex-col absolute h-full overflow-x-hidden" ref={windowViewRef} style={{ width }}>
                <If condition={lines.length === 0 && screen.nextLineNum.get() !== 1}>
                    <div className="flex items-center justify-center w-full p-2.5 h-full text-main">
                        <div>
                            <code className="bg-transparent text-green-500">
                                [workspace="{session.name.get()}" tab="{screen.name.get()}"]
                            </code>
                        </div>
                    </div>
                </If>
                <If condition={lines.length > 0}>
                    <LinesView
                        screen={screen}
                        width={size.width}
                        lines={lines}
                        renderMode={renderMode}
                        lineFactory={buildLineComponent}
                    />
                </If>
                <If condition={screen.filterRunning.get()}>
                    <div className="relative flex flex-row w-full border-t border-gray-700 p-2 items-center justify-center">
                        <div className="absolute top-0 left-0 w-full h-full bg-accent-bg z-10 pointer-events-none" />
                        <div className="cursor-pointer p-1 text-main z-20" onClick={disableFilter}>
                            Showing Running Commands &nbsp;
                            <i className="fa-sharp fa-solid fa-xmark-large" />
                        </div>
                    </div>
                </If>
            </div>
        );
    }
);

export const ScreenView: React.FC<{ session: Session; screen: Screen }> = observer(({ session, screen }) => {
    const screenViewRef = React.useRef<HTMLDivElement>(null);
    const [width, setWidth] = React.useState<number | null>(null);
    const [sidebarShowing, setSidebarShowing] = React.useState(false);

    const handleResize = React.useCallback(
        debounce(100, () => {
            if (screenViewRef.current) {
                setWidth(screenViewRef.current.offsetWidth);
            }
        }),
        []
    );

    React.useEffect(() => {
        const rszObs = new ResizeObserver(handleResize);
        if (screenViewRef.current) {
            rszObs.observe(screenViewRef.current);
            handleResize();
        }
        return () => rszObs.disconnect();
    }, [handleResize]);

    React.useEffect(() => {
        if (screen) {
            const viewOpts = screen.viewOpts.get();
            const hasSidebar = viewOpts?.sidebar?.open;
            if (hasSidebar) {
                const timeoutId = setTimeout(() => setSidebarShowing(true), 500);
                return () => clearTimeout(timeoutId);
            } else {
                setSidebarShowing(false);
            }
        }
    }, [screen]);

    const createWorkspace = () => GlobalCommandRunner.createNewSession();
    const createTab = () => GlobalCommandRunner.createNewScreen();

    if (width === null) {
        return <div className="flex-grow relative border-t border-gray-700 flex flex-col" ref={screenViewRef}></div>;
    }

    if (!session) {
        return (
            <div className="flex-grow relative border-t border-gray-700 flex flex-col" ref={screenViewRef}>
                <div className="flex items-center justify-center w-full p-2.5 h-full text-main">
                    <div className="flex flex-col items-center">
                        <code className="bg-transparent text-green-500">[no workspace]</code>
                        {GlobalModel.sessionList.length === 0 && (
                            <Button onClick={createWorkspace} style={{ marginTop: 10 }}>
                                Create New Workspace
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!screen) {
        return (
            <div className="flex-grow relative border-t border-gray-700 flex flex-col" ref={screenViewRef}>
                <div className="flex items-center justify-center w-full p-2.5 h-full text-main">
                    <div className="flex flex-col items-center">
                        <code className="bg-transparent text-green-500">[no active tab]</code>
                        {GlobalModel.getSessionScreens(session.sessionId).length === 0 && (
                            <Button onClick={createTab} style={{ marginTop: 10 }}>
                                Create New Tab
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const viewOpts = screen.viewOpts.get();
    const hasSidebar = viewOpts?.sidebar?.open;
    let winWidth = "100%";
    let sidebarWidth = "0px";
    if (hasSidebar) {
        const targetWidth = viewOpts?.sidebar?.width;
        let realWidth = 0;
        if (util.isBlank(targetWidth) || width < MagicLayout.ScreenSidebarMinWidth * 2) {
            realWidth = Math.floor(width / 2) - MagicLayout.ScreenSidebarWidthPadding;
        } else if (targetWidth.includes("%")) {
            let targetPercent = parseInt(targetWidth);
            if (targetPercent > 100) targetPercent = 100;
            realWidth = Math.floor((width * targetPercent) / 100);
            realWidth = util.boundInt(realWidth, MagicLayout.ScreenSidebarMinWidth, width - MagicLayout.ScreenSidebarMinWidth);
        } else {
            const targetWidthNum = parseInt(targetWidth);
            realWidth = util.boundInt(targetWidthNum, MagicLayout.ScreenSidebarMinWidth, width - MagicLayout.ScreenSidebarMinWidth);
        }
        winWidth = `${width - realWidth}px`;
        sidebarWidth = `${realWidth - MagicLayout.ScreenSidebarWidthPadding}px`;
    }

    return (
        <div className="flex-grow relative border-t border-gray-700 flex flex-col" id={screen.screenId} data-screenid={screen.screenId} ref={screenViewRef}>
            <ScreenWindowView
                key={`${screen.screenId}:${GlobalModel.getTermFontSize()}:${GlobalModel.devicePixelRatio.get()}:${GlobalModel.termRenderVersion.get()}`}
                session={session}
                screen={screen}
                width={winWidth}
            />
            <If condition={hasSidebar && sidebarShowing}>
                <ScreenSidebar screen={screen} width={sidebarWidth} />
            </If>
        </div>
    );
});