// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package remote

// ThreadModeResponse defines the structured output format for thread mode
type ThreadModeResponse struct {
	Explanation string `json:"explanation"`
	Command     string `json:"command"`
}

// ThreadModeJSONSchema provides the JSON schema for structured output
const ThreadModeJSONSchema = `{
	"name": "thread_mode_response",
	"description": "Response format for thread mode containing explanation and command",
	"schema": {
		"type": "object",
		"properties": {
			"explanation": {
				"type": "string",
				"description": "Brief explanation of what the command does and any important considerations"
			},
			"command": {
				"type": "string", 
				"description": "The exact command to execute (empty string if no command is needed)"
			}
		},
		"required": ["explanation", "command"],
		"additionalProperties": false
	}
}`