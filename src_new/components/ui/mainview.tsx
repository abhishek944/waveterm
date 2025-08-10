import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MainViewProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
    scrollable?: boolean;
}

const MainView: React.FC<MainViewProps> = ({
    title,
    onClose,
    children,
    className,
    scrollable = false,
}) => {
    return (
        <div className={cn("flex flex-col flex-grow bg-background", className)}>
            <header className="flex items-center justify-between p-2 border-b">
                <h2 className="text-lg font-semibold">{title}</h2>
                <button onClick={onClose} title="Close (Escape)" className="hover:bg-accent p-1 rounded-md">
                    <X className="h-5 w-5" />
                </button>
            </header>
            {scrollable ? (
                <ScrollArea className="flex-grow p-4">{children}</ScrollArea>
            ) : (
                <div className="flex-grow p-4">{children}</div>
            )}
        </div>
    );
};

export { MainView };