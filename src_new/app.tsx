// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import { clsx } from "clsx";

import { GlobalModel } from "@/models";
import { isBlank } from "@/lib/utils";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { PluginsView } from "@/plugins_view/plugins_view";
import { BookmarksView } from "@/components/bookmarks/bookmarks";
import { HistoryView } from "@/components/history/history";
import { ConnectionsView } from "@/components/connections/connections";
import { InfoView } from "@/components/info/info";
import { DisconnectedModal, ClientStopModal } from "@/components/modals";
import { ModalsProvider } from "@/components/modals/provider";

import "./globals.css";
import { ClientSettingsView } from "./components/clientsettings/clientsettings";
import { MainSideBar, RightSideBar } from "./components/sidebar";
import { TermStyleList } from "./components/ui/termstyle";
import { ErrorBoundary } from "./components/error/errorboundary";

const App: React.FC = mobxReact.observer(() => {
    const [dcWait, setDcWait] = React.useState(false);
    const [termThemesLoaded, setTermThemesLoaded] = React.useState(false);
    const mainContentRef = React.useRef<HTMLDivElement>(null);
    const chatFocusTimeoutId = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        if (GlobalModel.isDev) {
            // Dev mode styling can be handled with Tailwind classes if needed
            // document.body.classList.add("is-dev");
        }

        return () => {
            if (chatFocusTimeoutId.current) {
                clearTimeout(chatFocusTimeoutId.current);
                chatFocusTimeoutId.current = null;
            }
        };
    }, []);
    

    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        let isInNonTermInput = false;
        const activeElem = document.activeElement;
        if (activeElem != null && activeElem.nodeName === "TEXTAREA") {
            if (!activeElem.classList.contains("xterm-helper-textarea")) {
                isInNonTermInput = true;
            }
        }
        if (activeElem != null && activeElem.nodeName === "INPUT" && activeElem.getAttribute("type") === "text") {
            isInNonTermInput = true;
        }
        const opts: ContextMenuOpts = {};
        if (isInNonTermInput) {
            opts.showCut = true;
        }
        const sel = window.getSelection();
        if (!isBlank(sel?.toString()) || isInNonTermInput) {
            GlobalModel.contextEditMenu(e.nativeEvent, opts);
        }
    }, []);

    const updateDcWait = React.useCallback((val: boolean) => {
        setDcWait(val);
    }, []);



    const handleTermThemesRendered = React.useCallback(() => {
        setTermThemesLoaded(true);
    }, []);

    const remotesModel = GlobalModel.remotesModel;
    const disconnected = !GlobalModel.ws.open.get() || !GlobalModel.waveSrvRunning.get();
    const hasClientStop = GlobalModel.getHasClientStop();
    const platform = GlobalModel.getPlatform();
    const clientData = GlobalModel.clientData.get();

    // Previously, this is done in sidebar.tsx but it causes flicker when clientData is null cos screen-view shifts around.
    // Doing it here fixes the flicker cos app is not rendered until clientData is populated.
    // wait for termThemes as well (this actually means that the "connect" packet has been received)
    if (clientData == null || GlobalModel.termThemes.get() == null) {
        return null;
    }

    if (disconnected || hasClientStop) {
        if (!dcWait) {
            setTimeout(() => updateDcWait(true), 1500);
        }
        return (
            <div id="main" className="flex flex-col h-screen" data-platform={platform} onContextMenu={handleContextMenu}>
                <div ref={mainContentRef} className="main-content flex flex-row flex-1 min-h-0">
                    <MainSideBar parentRef={mainContentRef} />
                    <div className="flex-1 flex flex-col h-full overflow-hidden" />
                </div>
                {dcWait && (
                    <>
                        {disconnected && <DisconnectedModal />}
                        {!disconnected && hasClientStop && <ClientStopModal />}
                    </>
                )}
            </div>
        );
    }

    if (dcWait) {
        setTimeout(() => updateDcWait(false), 0);
    }

    // used to force a full reload of the application
    const renderVersion = GlobalModel.renderVersion.get();
    const mainSidebarCollapsed = GlobalModel.mainSidebarModel.getCollapsed();
    const rightSidebarCollapsed = GlobalModel.rightSidebarModel.getCollapsed();
    const mainClassName = clsx(
        "flex flex-col h-screen"
        // Platform-specific styling can be handled with data attributes if needed
        // Theme styling is handled by Tailwind's dark mode
        // Sidebar states can be handled with conditional rendering
    );

    return (
        <>
            <TermStyleList onRendered={handleTermThemesRendered} />
            <div key={`version-${renderVersion}`} id="main" className={mainClassName} data-platform={platform} data-theme={GlobalModel.isDarkTheme.get() ? "dark" : "light"} data-mainsidebar-collapsed={mainSidebarCollapsed} data-rightsidebar-collapsed={rightSidebarCollapsed} onContextMenu={handleContextMenu}>
                {termThemesLoaded && (
                    <>
                        <div ref={mainContentRef} className="main-content flex flex-row flex-1 min-h-0">
                            <MainSideBar parentRef={mainContentRef} />
                            <div className="flex-1 relative overflow-hidden">
                                <ErrorBoundary>
                                    <PluginsView />
                                    <WorkspaceView />
                                    <HistoryView />
                                    <BookmarksView />
                                    <ConnectionsView model={remotesModel} />
                                    <ClientSettingsView model={remotesModel} />
                                    <InfoView />
                                </ErrorBoundary>
                            </div>
                            <RightSideBar />
                        </div>
                        <ModalsProvider />
                    </>
                )}
            </div>
        </>
    );
});

export { App };
