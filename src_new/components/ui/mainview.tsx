import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { GlobalModel } from "@/models";
import { observer } from "mobx-react";

interface MainViewProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
    scrollable?: boolean;
}

const MainView: React.FC<MainViewProps> = observer(({
    title,
    onClose,
    children,
    className,
    scrollable = false,
}) => {
    const sidebarModel = GlobalModel.mainSidebarModel;
    const maxWidthSubtractor = sidebarModel.getCollapsed() ? 0 : sidebarModel.getWidth();
    
    return (
        <div 
            className={cn("flex-grow flex flex-col relative bg-black", className)}
            style={{ maxWidth: `calc(100vw - ${maxWidthSubtractor}px)` }}
        >
            <div className={cn("border-b border-gray-800", {
                "pl-20": sidebarModel.getCollapsed() && GlobalModel.getPlatform() === "darwin",
                "pl-14": sidebarModel.getCollapsed() && GlobalModel.getPlatform() !== "darwin"
            })}>
                <header className="flex items-center justify-between h-[38px] px-2.5 select-none app-region-drag">
                    <h2 className="text-lg font-semibold text-green-500 px-2.5 leading-[38px] align-middle">{title}</h2>
                    <button 
                        onClick={onClose} 
                        title="Close (Escape)" 
                        className="hover:bg-gray-700 p-1 rounded-md text-lg app-region-no-drag"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>
            </div>
            {scrollable ? (
                <OverlayScrollbarsComponent
                    className="flex-1 flex flex-col"
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