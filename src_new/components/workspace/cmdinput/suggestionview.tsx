import { getAll, getFirst } from "@/autocomplete/runtime/utils";
import { AuxiliaryCmdView } from "@/components/workspace";
import { clsx } from "clsx";
import { action } from "mobx";
import { observer } from "mobx-react";
import { GlobalModel } from "@/models";
import React, { useEffect } from "react";
import { If } from "tsx-control-statements/components";

export const AutocompleteSuggestionView: React.FC = observer(() => {
    const inputModel = GlobalModel.inputModel;
    const autocompleteModel = GlobalModel.autocompleteModel;
    const selectedSuggestion = autocompleteModel.getPrimarySuggestionIndex();

    const updateScroll = action((index: number) => {
        autocompleteModel.setPrimarySuggestionIndex(index);
        const element = document.getElementsByClassName("suggestion-item")[index] as HTMLElement;
        if (element) {
            element.scrollIntoView({ block: "nearest" });
        }
    });

    const closeView = action(() => {
        inputModel.closeAuxView();
    });

    const setSuggestion = action((idx: number) => {
        autocompleteModel.applySuggestion(idx);
        autocompleteModel.loadSuggestions();
        closeView();
    });

    useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;

        keybindManager.registerKeybinding("pane", "autocomplete", "generic:confirm", () => {
            setSuggestion(selectedSuggestion);
            return true;
        });
        keybindManager.registerKeybinding("pane", "autocomplete", "generic:cancel", () => {
            closeView();
            return true;
        });
        keybindManager.registerKeybinding("pane", "autocomplete", "generic:selectAbove", () => {
            updateScroll(Math.max(0, selectedSuggestion - 1));
            return true;
        });
        keybindManager.registerKeybinding("pane", "autocomplete", "generic:selectBelow", () => {
            updateScroll(Math.min(suggestions?.length - 1, selectedSuggestion + 1));
            return true;
        });
        keybindManager.registerKeybinding("pane", "autocomplete", "generic:tab", () => {
            updateScroll(Math.min(suggestions?.length - 1, selectedSuggestion + 1));
            return true;
        });

        return () => {
            GlobalModel.keybindManager.unregisterDomain("autocomplete");
        };
    }, [selectedSuggestion]);

    const suggestions: Fig.Suggestion[] = autocompleteModel.getSuggestions();

    return (
        <AuxiliaryCmdView title="Suggestions" className="suggestions-view" onClose={closeView} scrollable={true}>
            <div className="flex flex-col min-h-[1em]">
                <If condition={!suggestions || suggestions.length === 0}>
                    <div className="no-suggestions">No suggestions</div>
                </If>
                {suggestions?.map((suggestion, idx) => (
                    <option
                        key={getFirst(suggestion.name)}
                        title={suggestion.description}
                        className={clsx(
                            "suggestion-item whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer rounded-md",
                            {
                                "is-selected font-bold text-primary bg-selected hover:bg-selected-hover":
                                    selectedSuggestion === idx,
                            },
                            "hover:bg-hover"
                        )}
                        onClick={() => {
                            setSuggestion(idx);
                        }}
                    >
                        {`${suggestion.icon} ${suggestion.displayName ?? getAll(suggestion.name).join(",")} ${
                            suggestion.description ? `- ${suggestion.description}` : ""
                        }`}
                    </option>
                ))}
            </div>
        </AuxiliaryCmdView>
    );
});