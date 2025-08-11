import * as React from "react";
import { cn } from "../../lib/utils";

interface ResizableSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    position: "left" | "right";
    initialWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    /** Collapse sidebar completely */
    collapsed?: boolean;
    children: React.ReactNode;
}

const ResizableSidebar = React.forwardRef<HTMLDivElement, ResizableSidebarProps>(
    (
        {
            className,
            children,
            position,
            initialWidth = 300,
            minWidth = 200,
            maxWidth = 500,
            collapsed = false,
            ...props
        },
        ref
    ) => {
        const [width, setWidth] = React.useState(initialWidth);
        const isResizing = React.useRef(false);

        const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault();
            isResizing.current = true;
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        };

        const handleMouseMove = React.useCallback(
            (e: MouseEvent) => {
                if (!isResizing.current) return;

                let newWidth;
                if (position === "right") {
                    newWidth = document.body.offsetWidth - e.clientX;
                } else {
                    newWidth = e.clientX;
                }

                if (newWidth > maxWidth) {
                    newWidth = maxWidth;
                } else if (newWidth < minWidth) {
                    newWidth = minWidth;
                }
                setWidth(newWidth);
            },
            [minWidth, maxWidth, position]
        );

        const handleMouseUp = () => {
            isResizing.current = false;
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        return (
            <div
                ref={ref}
                className={cn("flex h-full relative", className)}
                style={{ width: collapsed ? 0 : width, transition: "width 0.2s ease" }}
                {...props}
            >
                {children}
                <div
                    className={cn(
                        "absolute top-0 h-full w-3 cursor-col-resize z-20 bg-transparent hover:bg-white/20",
                        position === "left" ? "-right-0.5" : "-left-0.5"
                    )}
                    onMouseDown={handleMouseDown}
                />
            </div>
        );
    }
);

ResizableSidebar.displayName = "ResizableSidebar";

export { ResizableSidebar };
