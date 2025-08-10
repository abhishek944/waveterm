import * as React from "react";
import { cn } from "@/lib/utils";

interface TabIconProps {
    icon: string;
    color: string;
}

const TabIcon: React.FC<TabIconProps> = ({ icon, color }) => {
    let iconClass = "";
    if (icon === "default" || icon === "square") {
        iconClass = "fa-solid fa-square fa-fw";
    } else if (icon === "cloud") {
        iconClass = "fa-solid fa-cloud fa-fw";
    } else {
        iconClass = `fa-sharp fa-solid fa-${icon} fa-fw`;
    }
    if (!color || color === "default") {
        color = "green";
    }

    return (
        <div className={cn("tabicon", `color-${color}`)}>
            <i className={iconClass} />
        </div>
    );
};

export { TabIcon };
