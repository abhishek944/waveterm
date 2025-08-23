package cmdrunner

import (
	"context"
	"log"
	"os"
	"regexp"
	"time"

	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

// waitForCommandOutput waits for a command to complete and returns its output
func waitForCommandOutput(ctx context.Context, screenId string, cmdLineId string) (string, int) {
	maxWaitTime := 30 * time.Minute
	startTime := time.Now()

	for {
		// Check if context is cancelled
		select {
		case <-ctx.Done():
			return "", -1
		default:
		}

		// Check timeout
		if time.Since(startTime) > maxWaitTime {
			log.Printf("Timeout waiting for command %s to complete", cmdLineId)
			return "Command execution timeout", -1
		}

		// Get command status
		cmd, err := sstore.GetCmdByScreenId(ctx, screenId, cmdLineId)
		if err != nil {
			log.Printf("Error getting command: %v", err)
			return "", -1
		}

		if cmd.Status == sstore.CmdStatusDone || cmd.Status == sstore.CmdStatusError {
			// Read PTY output
			ptyPath, err := scbase.PtyOutFile(screenId, cmdLineId)
			if err != nil {
				log.Printf("Error getting PTY path: %v", err)
				return "Error getting command output path", cmd.ExitCode
			}
			outputBytes, err := os.ReadFile(ptyPath)
			if err != nil {
				log.Printf("Error reading PTY output: %v", err)
				return "Error reading command output", cmd.ExitCode
			}

			return string(outputBytes), cmd.ExitCode
		}

		// Wait a bit before checking again
		time.Sleep(100 * time.Millisecond)
	}
}

// isCommandAllowed checks if a command matches any of the allowed regex patterns
func isCommandAllowed(command string, allowCommands []string) bool {
	if len(allowCommands) == 0 {
		return false // No patterns defined, nothing is allowed
	}

	for _, pattern := range allowCommands {
		if pattern == "" {
			continue
		}

		// Compile and match the regex pattern
		regex, err := regexp.Compile(pattern)
		if err != nil {
			log.Printf("[isCommandAllowed] Invalid regex pattern '%s': %v", pattern, err)
			continue
		}

		if regex.MatchString(command) {
			log.Printf("[isCommandAllowed] Command '%s' matches pattern '%s'", command, pattern)
			return true
		}
	}

	log.Printf("[isCommandAllowed] Command '%s' does not match any allowed patterns", command)
	return false
}