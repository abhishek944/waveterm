// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { reaction } from "mobx";
import { GlobalModel, GlobalCommandRunner, Session, Screen } from "@/models";
import { Plus, Sparkles } from "lucide-react";
import { Reorder } from "framer-motion";
import { ScreenTab } from "@/components/workspace";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";

export const ScreenTabs = observer(({ session }: { session: Session }) => {
    const tabsRef = React.useRef<HTMLDivElement>(null);
    const [showingScreens, setShowingScreens] = React.useState<Screen[]>([]);
    const lastActiveScreenId = React.useRef<string | null>(null);
    const deltaYHistory = React.useRef<number[]>([]);

    const getScreens = React.useCallback((): Screen[] => {
        if (!session) return [];
        const activeScreenId = session.activeScreenId.get();
        if (!activeScreenId) return [];

        const screens = GlobalModel.getSessionScreens(session.sessionId);
        const visibleScreens = screens.filter((screen) => !screen.archived.get() || activeScreenId === screen.screenId);
        visibleScreens.sort((a, b) => a.screenIdx.get() - b.screenIdx.get());
        return visibleScreens;
    }, [session]);

    React.useEffect(() => {
        setShowingScreens(getScreens());
        const dispose = reaction(
            () => getScreens(),
            (screens) => setShowingScreens(screens),
            { fireImmediately: true }
        );
        return dispose;
    }, [getScreens]);

    React.useEffect(() => {
        const activeScreenId = session?.activeScreenId.get();
        if (activeScreenId && activeScreenId !== lastActiveScreenId.current) {
            lastActiveScreenId.current = activeScreenId;
            const timeoutId = setTimeout(() => {
                const tabElem = tabsRef.current?.querySelector(`.screen-tab[data-screenid="${activeScreenId}"]`);
                tabElem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [session, showingScreens]);

    const handleWheel = (event: WheelEvent) => {
        if (!tabsRef.current) return;
        deltaYHistory.current.push(Math.abs(event.deltaY));
        if (deltaYHistory.current.length > 5) deltaYHistory.current.shift();
        if (deltaYHistory.current.some((delta) => delta > 0)) {
            tabsRef.current.scrollLeft += event.deltaY;
            event.preventDefault();
        }
    };

    React.useEffect(() => {
        const currentTabsRef = tabsRef.current;
        currentTabsRef?.addEventListener("wheel", handleWheel, { passive: false });
        return () => currentTabsRef?.removeEventListener("wheel", handleWheel);
    }, []);

    const handleNewScreen = () => GlobalCommandRunner.createNewScreen();
    const handleSwitchScreen = (screenId: string) => {
        if (session?.activeScreenId.get() !== screenId) {
            GlobalCommandRunner.switchScreen(screenId);
        }
    };

    if (!session) return null;

    const mainSidebarCollapsed = GlobalModel.mainSidebarModel.getCollapsed();
    const rightSidebarCollapsed = GlobalModel.rightSidebarModel.getCollapsed();
    const platform = GlobalModel.getPlatform();

    return (
        <div className="flex relative overflow-hidden h-[38px] z-20">
            {mainSidebarCollapsed && (
                <div className="flex-shrink-0 h-full px-2 cursor-pointer hover:bg-gray-700 flex items-center justify-center"
                     onClick={() => GlobalModel.mainSidebarModel.setCollapsed(false)}>
                    <img className="h-6 w-6" src="public/logos/wave-logo.png" alt="logo" />
                </div>
            )}
            <div className="overflow-x-scroll overflow-y-hidden no-scrollbar flex-1">
                <Reorder.Group
                    className="flex flex-row h-full"
                    ref={tabsRef}
                    as="ul"
                    axis="x"
                    onReorder={setShowingScreens}
                    values={showingScreens}
                >
                    {showingScreens.map((screen: Screen) => (
                        <ScreenTab
                            key={screen.screenId}
                            screen={screen}
                            activeScreenId={session.activeScreenId.get()}
                            index={screen.screenIdx.get()}
                            onSwitchScreen={handleSwitchScreen}
                        />
                    ))}
                </Reorder.Group>
            </div>
            <div className="flex-shrink-0 cursor-pointer flex items-center h-full px-2 hover:bg-gray-700" onClick={handleNewScreen}>
                <Plus className="w-5 h-5 text-gray-400 hover:text-white" />
            </div>
            {rightSidebarCollapsed && GlobalModel.activeMainView.get() === "session" && (
                <div className="flex-shrink-0 px-1.5 flex items-center h-full" title="Open Wave AI (Cmd-Shift-Space)">
                    <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 px-2 bg-secondary text-secondary-foreground hover:bg-secondary/80" 
                        onClick={() => GlobalModel.rightSidebarModel.setCollapsed(false)}
                    >
                        <Sparkles className="w-4 h-4" />
                    </Button>
                </div>
            )}
            {rightSidebarCollapsed && (
                <div className={clsx("flex-shrink-0 h-full app-region-drag", {
                    "w-12": platform !== "darwin",
                    "w-16": platform === "darwin",
                })} />
            )}
        </div>
    );
});