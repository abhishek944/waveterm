import * as React from "react";
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { GlobalModel } from "@/models";
import ReactDOM from "react-dom";

const VALID_CSS_VARIABLES = [
    "--term-black",
    "--term-red",
    "--term-green",
    "--term-yellow",
    "--term-blue",
    "--term-magenta",
    "--term-cyan",
    "--term-white",
    "--term-bright-black",
    "--term-bright-red",
    "--term-bright-green",
    "--term-bright-yellow",
    "--term-bright-blue",
    "--term-bright-magenta",
    "--term-bright-cyan",
    "--term-bright-white",
    "--term-gray",
    "--term-cmdtext",
    "--term-foreground",
    "--term-background",
    "--term-selection-background",
    "--term-cursor-accent",
];

const isValidCSSColor = (color: string) => {
    const element = document.createElement("div");
    element.style.color = color;
    return element.style.color !== "";
};

const camelCaseToKebabCase = (str: string) => {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
};

const TermStyle: React.FC<{ themeName: string; selector: string }> = observer(({ themeName, selector }) => {
    useEffect(() => {
        GlobalModel.bumpTermRenderVersion();
        return () => {
            GlobalModel.bumpTermRenderVersion();
        };
    }, [themeName, selector]);

    const getStyleRules = () => {
        const termThemeOptions = GlobalModel.getTermThemes();
        if (!(themeName in termThemeOptions)) {
            return null;
        }
        const theme = termThemeOptions[themeName];
        if (!theme) {
            return null;
        }
        const styleProperties = Object.entries(theme)
            .filter(([key, value]) => {
                const cssVarName = `--term-${camelCaseToKebabCase(key)}`;
                return VALID_CSS_VARIABLES.includes(cssVarName) && isValidCSSColor(value as string);
            })
            .map(([key, value]) => `--term-${key}: ${value};`)
            .join(" ");

        if (!styleProperties) {
            return null;
        }
        return `${selector} { ${styleProperties} }`;
    };

    const styleRules = getStyleRules();
    if (!styleRules) {
        return null;
    }
    return ReactDOM.createPortal(<style>{styleRules}</style>, document.head);
});

const TermStyleList: React.FC<{ onRendered: () => void }> = observer(({ onRendered }) => {
    useEffect(() => {
        onRendered();
    }, [onRendered]);

    const getSelector = (themeKey: string) => {
        const sessions = GlobalModel.getSessionNames();
        const screens = GlobalModel.getScreenNames();

        if (themeKey === "root") {
            return ":root";
        } else if (themeKey in screens) {
            return `.main-content [data-screenid="${themeKey}"]`;
        } else if (themeKey in sessions) {
            return `.main-content [data-sessionid="${themeKey}"]`;
        }

        return null;
    };

    const termTheme = GlobalModel.getTermThemeSettings();

    return (
        <>
            {Object.keys(termTheme).map((themeKey) => {
                const selector = getSelector(themeKey);
                if (!selector) return null;
                return <TermStyle key={themeKey} themeName={termTheme[themeKey]} selector={selector} />;
            })}
        </>
    );
});

export { TermStyleList };