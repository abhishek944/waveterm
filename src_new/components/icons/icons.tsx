import React from "react";
import { clsx } from "clsx";
import { ReactComponent as SpinnerIndicator } from "@/components/assets/icons/spinner-indicator.svg";
import * as appconst from "@/appconst";

import { ReactComponent as RotateIconSvg } from "@/components/assets/icons/line/rotate.svg";

interface PositionalIconProps {
    children?: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    divRef?: React.RefObject<HTMLDivElement>;
}

export const FrontIcon: React.FC<PositionalIconProps> = (props) => {
    return (
        <div
            ref={props.divRef}
            className={clsx("hidden w-5 h-5 mr-[5px]", props.className)}
            onClick={props.onClick}
        >
            <div className="flex w-full h-full items-center justify-center [&>div]:w-5 [&>div]:flex [&>div]:text-center [&>div]:items-center [&>div]:justify-center [&>i]:w-5 [&>i]:flex [&>i]:text-center [&>i]:items-center [&>i]:justify-center [&>span]:w-5 [&>span]:flex [&>span]:text-center [&>span]:items-center [&>span]:justify-center">
                {props.children}
            </div>
        </div>
    );
};

export const CenteredIcon: React.FC<PositionalIconProps> = (props) => {
    return (
        <div
            ref={props.divRef}
            className={clsx("w-5 h-5 text-base", props.className)}
            onClick={props.onClick}
        >
            <div className="flex w-full h-full items-center justify-center [&>div]:w-5 [&>div]:flex [&>div]:text-center [&>div]:items-center [&>div]:justify-center [&>i]:w-5 [&>i]:flex [&>i]:text-center [&>i]:items-center [&>i]:justify-center [&>span]:w-5 [&>span]:flex [&>span]:text-center [&>span]:items-center [&>span]:justify-center">
                {props.children}
            </div>
        </div>
    );
};

interface ActionsIconProps {
    onClick: React.MouseEventHandler<HTMLDivElement>;
}

export const ActionsIcon: React.FC<ActionsIconProps> = (props) => {
    return (
        <CenteredIcon className="hover:bg-gray-700 rounded cursor-pointer" onClick={props.onClick}>
            <i className="fa-sharp fa-solid fa-ellipsis-vertical text-sm"></i>
        </CenteredIcon>
    );
};

export const SyncSpin: React.FC<{
    classRef?: React.RefObject<Element>;
    children?: React.ReactNode;
    shouldSync?: boolean;
}> = (props) => {
    const { classRef, children, shouldSync } = props;
    const [listenerAdded, setListenerAdded] = React.useState(false);

    const handleAnimationStart = (_e: AnimationEvent) => {
        const classRef = props.classRef;
        if (classRef.current == null) {
            return;
        }
        const svgElem = classRef.current.querySelector("svg");
        if (svgElem == null) {
            return;
        }
        const animArr = svgElem.getAnimations();
        if (animArr == null || animArr.length == 0) {
            return;
        }
        animArr[0].startTime = 0;
    };

    React.useEffect(() => {
        const shouldSyncVal = shouldSync ?? true;
        if (!shouldSyncVal || classRef.current == null) {
            return;
        }
        const elem = classRef.current;
        const svgElem = elem.querySelector("svg");
        if (svgElem == null) {
            return;
        }
        if (!listenerAdded) {
            svgElem.addEventListener("animationstart", handleAnimationStart);
            setListenerAdded(true);
        }
        const animArr = svgElem.getAnimations();
        if (animArr == null || animArr.length == 0) {
            return;
        }
        animArr[0].startTime = 0;
        return () => {
            if (listenerAdded) {
                svgElem.removeEventListener("animationstart", handleAnimationStart);
                setListenerAdded(false);
            }
        };
    });
    return children;
};

interface StatusIndicatorProps {
    /**
     * The level of the status indicator. This will determine the color of the status indicator.
     */
    level: appconst.StatusIndicatorLevel;
    className?: string;
    /**
     * If true, a spinner will be shown around the status indicator.
     */
    runningCommands?: boolean;
}

/**
 * This component is used to show the status of a command. It will show a spinner around the status indicator if there are running commands. It will also delay showing the spinner for a short time to prevent flickering.
 */
export const StatusIndicator: React.FC<StatusIndicatorProps> = (props) => {
    const { level, className, runningCommands } = props;
    const iconRef = React.useRef<HTMLDivElement>();
    const [spinnerVisible, setSpinnerVisible] = React.useState(false);
    const [timeoutState, setTimeoutState] = React.useState<NodeJS.Timeout>(undefined);

    const clearSpinnerTimeout = () => {
        if (timeoutState) {
            clearTimeout(timeoutState);
            setTimeoutState(undefined);
        }
        setSpinnerVisible(false);
    };

    /**
     * This will apply a delay after there is a running command before showing the spinner. This prevents flickering for commands that return quickly.
     */
    React.useEffect(() => {
        if (runningCommands && !timeoutState) {
            setTimeoutState(
                setTimeout(() => {
                    setSpinnerVisible(true);
                }, 100)
            );
        } else if (!runningCommands) {
            clearSpinnerTimeout();
        }
        return () => {
            clearSpinnerTimeout();
        };
    }, [runningCommands]);

    let statusIndicator = null;
    if (level != appconst.StatusIndicatorLevel.None || spinnerVisible) {
        let indicatorLevelClass = "";
        switch (level) {
            case appconst.StatusIndicatorLevel.Output:
                indicatorLevelClass = "status-output";
                break;
            case appconst.StatusIndicatorLevel.Success:
                indicatorLevelClass = "status-success";
                break;
            case appconst.StatusIndicatorLevel.Error:
                indicatorLevelClass = "status-error";
                break;
        }

        const spinnerVisibleClass = spinnerVisible ? "spinner-visible" : "";
        const visibilityClass = (spinnerVisible || level !== appconst.StatusIndicatorLevel.None) ? "inline-block" : "";
        
        statusIndicator = (
            <CenteredIcon
                divRef={iconRef}
                className={clsx(
                    className, 
                    indicatorLevelClass, 
                    spinnerVisibleClass, 
                    visibilityClass,
                    "status-indicator [&_#spinner]:invisible [&_#indicator]:invisible",
                    spinnerVisible && "[&_.spin_#spinner]:visible [&_.spin_#spinner]:stroke-white",
                    indicatorLevelClass === "status-error" && "[&_#indicator]:visible [&_#indicator]:fill-red-500",
                    indicatorLevelClass === "status-success" && "[&_#indicator]:visible [&_#indicator]:fill-green-500",
                    indicatorLevelClass === "status-output" && "[&_#indicator]:visible [&_#indicator]:fill-white"
                )}
            >
                <SpinnerIndicator className={spinnerVisible ? "spin" : null} />
            </CenteredIcon>
        );
    }
    return (
        <SyncSpin classRef={iconRef} shouldSync={runningCommands}>
            {statusIndicator}
        </SyncSpin>
    );
};

export const RotateIcon: React.FC<{ className?: string; onClick?: React.MouseEventHandler<HTMLDivElement> }> = (
    props
) => {
    const iconRef = React.useRef<HTMLDivElement>();
    return (
        <SyncSpin classRef={iconRef}>
            <div ref={iconRef} className="inline-flex" onClick={props.onClick}>
                <RotateIconSvg className={props.className ?? ""} />
            </div>
        </SyncSpin>
    );
};