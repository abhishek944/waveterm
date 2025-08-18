import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { GlobalModel } from "@/models";
import { observer } from "mobx-react";

interface MainViewProps {
    title: string;
    onClose?: () => void;
    children: React.ReactNode;
    className?: string;
    scrollable?: boolean;
    separator?: boolean;
}

const MainView: React.FC<MainViewProps> = observer(({
    title,
    onClose,
    children,
    className,
    scrollable = false,
    separator = false,
}) => {
    const sidebarModel = GlobalModel.mainSidebarModel;
    const maxWidthSubtractor = sidebarModel.getCollapsed() ? 0 : sidebarModel.getWidth();
    
    return (
        <div
            className={cn("absolute inset-0 flex flex-col bg-black", className)}
            style={{ maxWidth: `calc(100vw - ${maxWidthSubtractor}px)` }}
        >
            <div className={cn("border-b border-gray-800", {
                "pl-20": sidebarModel.getCollapsed() && GlobalModel.getPlatform() === "darwin",
                "pl-14": sidebarModel.getCollapsed() && GlobalModel.getPlatform() !== "darwin"
            })}>
                <header className="flex items-center justify-between h-[38px] px-2.5 select-none app-region-drag">
                    {separator && <div className="h-px w-full bg-gray-800"></div>}
                </header>
            </div>
            {scrollable ? (
                <OverlayScrollbarsComponent
                    className="flex-1 flex flex-col overflow-hidden"
                    options={{ scrollbars: { autoHide: "leave" } }}
                    defer={true}
                >
                    {children}
                </OverlayScrollbarsComponent>
            ) : (
                <div className="flex-1 flex flex-col">{children}</div>
            )}
        </div>
    );
});

export { MainView };