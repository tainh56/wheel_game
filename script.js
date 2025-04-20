(function() {
    'use strict'; // Enable strict mode

    // --- Constants ---
    const WHEEL_CANVAS_ID = 'wheelCanvas';
    const SPIN_BUTTON_ID = 'spinButton';
    const RESET_BUTTON_ID = 'resetButton';
    const RESULT_DIV_ID = 'result';
    const WIN_RATE_SLIDER_ID = 'winRateSlider';
    const WIN_RATE_VALUE_SPAN_ID = 'winRateValue';
    const PLAYER_BALANCE_SPAN_ID = 'playerBalance';
    const BET_AMOUNT_INPUT_ID = 'betAmount';
    const HISTORY_LOG_ID = 'historyLog';
    const MESSAGE_BOX_OVERLAY_ID = 'messageBoxOverlay';
    const MESSAGE_TEXT_ID = 'messageText';
    const MESSAGE_CLOSE_BUTTON_ID = 'messageCloseButton';

    const LOCAL_STORAGE_KEY = 'wheelGameState_BigInt_v3'; // Updated key for new structure
    const INITIAL_BALANCE = 100n;
    const DEFAULT_BET = 10n;
    const DEFAULT_WIN_RATE = 70;
    const MAX_HISTORY = 10;
    const MIN_BET = 1n;

    // Colors (Consider moving to CSS variables if preferred)
    const WIN_COLOR = '#2ecc71'; // Green
    const LOSE_COLOR = '#e67e22'; // Orange
    // const POINTER_COLOR = '#c0392b'; // Defined in CSS
    const TEXT_COLOR_NEUTRAL = '#5a3a24'; // Defined in CSS var(--text-color)
    const TEXT_COLOR_WIN = '#27ae60';     // Defined in CSS var(--win-text-color)
    const TEXT_COLOR_LOSE = '#c0392b';    // Defined in CSS var(--lose-text-color)

    // CSS Classes
    const HISTORY_WIN_CLASS = 'history-win';
    const HISTORY_LOSS_CLASS = 'history-loss';
    const HISTORY_RESULT_WIN_CLASS = 'win-color'; // Class for the result text color
    const HISTORY_RESULT_LOSE_CLASS = 'lose-color'; // Class for the result text color
    const MESSAGE_BOX_VISIBLE_CLASS = 'visible';

    // Spin Animation Parameters
    const MIN_SPIN_DURATION = 4000; // ms
    const RANDOM_SPIN_DURATION = 3000; // ms
    const MIN_SPIN_ANGLE_SPEED = 10; // degrees per frame (initial speed factor)
    const RANDOM_SPIN_ANGLE_SPEED = 10; // degrees per frame (random part)
    const EASE_OUT_FACTOR = Math.PI / 2; // For sine easing

    // --- DOM Elements ---
    const canvas = document.getElementById(WHEEL_CANVAS_ID);
    const spinButton = document.getElementById(SPIN_BUTTON_ID);
    const resetButton = document.getElementById(RESET_BUTTON_ID);
    const resultDiv = document.getElementById(RESULT_DIV_ID);
    const winRateSlider = document.getElementById(WIN_RATE_SLIDER_ID);
    const winRateValueSpan = document.getElementById(WIN_RATE_VALUE_SPAN_ID);
    const playerBalanceSpan = document.getElementById(PLAYER_BALANCE_SPAN_ID);
    const betAmountInput = document.getElementById(BET_AMOUNT_INPUT_ID);
    const historyLog = document.getElementById(HISTORY_LOG_ID);
    const messageBoxOverlay = document.getElementById(MESSAGE_BOX_OVERLAY_ID);
    const messageText = document.getElementById(MESSAGE_TEXT_ID);
    const messageCloseButton = document.getElementById(MESSAGE_CLOSE_BUTTON_ID);

    // Ensure canvas context is available
    if (!canvas || typeof canvas.getContext !== 'function') {
        console.error("Canvas element not found or context not supported.");
        // Attempt to show message, but it might fail if elements aren't ready
        try { showMessage("Lỗi: Không thể khởi tạo khu vực vòng quay."); } catch(e) {}
        return; // Stop script execution if canvas fails
    }
    const ctx = canvas.getContext('2d');

    // --- Game Settings ---
    let segments = [
        { color: WIN_COLOR, label: 'Xanh lá', weight: DEFAULT_WIN_RATE },
        { color: LOSE_COLOR, label: 'Cam', weight: 100 - DEFAULT_WIN_RATE }
    ];

    // --- State Variables ---
    let playerBalance = INITIAL_BALANCE;
    let currentBet = 0n;
    let spinHistory = [];
    let totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
    const radius = canvas.width / 2 - 10; // Outer radius
    const center = canvas.width / 2;

    // Animation State
    let currentAngle = 0; // In radians
    let spinAngleStartSpeed = 0; // Initial angular speed factor
    let spinTime = 0; // Current timestamp from performance.now() during animation
    let spinStartTime = 0; // Timestamp when the spin started
    let spinTimeTotal = 0; // Total duration for current spin
    let isSpinning = false;
    let animationFrameId = null; // To store requestAnimationFrame ID

    // --- Utility Functions ---

    // Helper function to parse BigInt from input, returns null on error/invalid
    function parseBetInput(inputElement) {
        try {
            const betInputStr = inputElement.value.trim();
            // Allow empty string during typing, but treat as invalid for spin/save
            if (betInputStr === '') {
                return null; // Indicate empty input
            }
            // Strict check for only digits
            if (!/^\d+$/.test(betInputStr)) {
                console.warn("Invalid bet input characters:", betInputStr);
                return null; // Indicate invalid characters
            }
            return BigInt(betInputStr);
        } catch (e) {
            // Handles potential BigInt conversion errors (e.g., too large for string)
            console.error("Error parsing bet amount to BigInt:", e);
            return null; // Indicate parsing error
        }
    }

    function showMessage(message) {
        // Check if elements exist before using them (robustness)
        if (messageText && messageBoxOverlay) {
            messageText.textContent = message;
            messageBoxOverlay.classList.add(MESSAGE_BOX_VISIBLE_CLASS);
        } else {
            console.error("Message box elements not found. Message:", message);
            // Fallback alert if UI elements aren't ready
            alert(message);
        }
    }

    function hideMessage() {
        if (messageBoxOverlay) {
            messageBoxOverlay.classList.remove(MESSAGE_BOX_VISIBLE_CLASS);
        }
    }

    // --- Local Storage Functions ---
    function saveGameState() {
        try {
            // Get the current bet value from the input field for saving
            let betToSave = parseBetInput(betAmountInput);
            let betStringToSave;

            if (betToSave === null) {
                // If input is currently invalid (e.g., empty, non-numeric), decide what to save.
                // Saving '0' or the last valid 'currentBet' might be options.
                // Let's save the last *successfully placed* bet (currentBet) if input is invalid.
                // If currentBet is also 0 (e.g., initial state), save '0'.
                betStringToSave = currentBet > 0n ? currentBet.toString() : '0';
                console.warn("Bet input invalid during save, saving last placed bet:", betStringToSave);
            } else {
                 // Ensure saved bet isn't negative or exceeds balance (though UI should prevent this)
                 if (betToSave < MIN_BET && playerBalance > 0n) betToSave = MIN_BET;
                 if (betToSave > playerBalance) betToSave = playerBalance;
                 if (playerBalance <= 0n) betToSave = 0n;
                 betStringToSave = betToSave.toString();
            }


            const gameState = {
                balance: playerBalance.toString(),
                winRate: parseInt(winRateSlider.value, 10), // Ensure radix 10
                history: spinHistory.map(entry => ({
                    ...entry, // Keep result, color
                    bet: entry.bet.toString(),
                    outcome: entry.outcome.toString(),
                    balanceAfter: entry.balanceAfter.toString()
                })),
                lastBet: betStringToSave // Save the validated bet amount string
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gameState));
            // console.log("Game state saved (BigInt)."); // Less verbose logging
        } catch (error) {
            console.error("Error saving game state to localStorage:", error);
            showMessage("Không thể lưu trạng thái trò chơi.");
        }
    }

    function loadGameState() {
        let loadedBetAmount = DEFAULT_BET;
        try {
            const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);

                playerBalance = savedState.balance !== undefined ? BigInt(savedState.balance) : INITIAL_BALANCE;

                spinHistory = Array.isArray(savedState.history)
                    ? savedState.history.map(entry => ({
                        ...entry,
                        bet: BigInt(entry.bet || '0'),
                        outcome: BigInt(entry.outcome || '0'),
                        balanceAfter: BigInt(entry.balanceAfter || '0')
                      }))
                    : [];

                winRateSlider.value = savedState.winRate !== undefined ? savedState.winRate : DEFAULT_WIN_RATE;

                if (savedState.lastBet !== undefined) {
                    try {
                        loadedBetAmount = BigInt(savedState.lastBet);
                    } catch (e) {
                        console.warn("Could not parse saved lastBet, using default:", savedState.lastBet);
                        loadedBetAmount = DEFAULT_BET;
                    }
                }
                // console.log("Game state loaded (BigInt).");
            } else {
                // No saved state, use defaults
                playerBalance = INITIAL_BALANCE;
                winRateSlider.value = DEFAULT_WIN_RATE;
                spinHistory = [];
                loadedBetAmount = DEFAULT_BET;
                // console.log("No saved state found, using defaults (BigInt).");
            }
        } catch (error) {
            console.error("Error loading game state from localStorage:", error);
            playerBalance = INITIAL_BALANCE;
            winRateSlider.value = DEFAULT_WIN_RATE;
            spinHistory = [];
            loadedBetAmount = DEFAULT_BET;
            // Consider clearing potentially corrupted data
            // localStorage.removeItem(LOCAL_STORAGE_KEY);
            showMessage("Lỗi khi tải trạng thái đã lưu, bắt đầu lại.");
        }

        // --- Initial UI Setup ---
        updateBalanceDisplay();
        updateWeightsAndRedraw(); // Updates segments, totalWeight, draws wheel
        updateHistoryDisplay();

        // Set initial bet amount, validating against loaded balance
        let finalBetAmount = loadedBetAmount;
        if (playerBalance <= 0n) {
            finalBetAmount = 0n;
        } else {
            if (finalBetAmount < MIN_BET) {
                finalBetAmount = MIN_BET;
            }
            if (finalBetAmount > playerBalance) {
                finalBetAmount = playerBalance; // Cap bet at current balance
            }
        }
        betAmountInput.value = finalBetAmount.toString();
        currentBet = 0n; // Reset currentBet until a spin is initiated

        // Enable/disable controls based on loaded state
        updateControlsState();

        // Clear result message and ensure message box is hidden
        resultDiv.textContent = '';
        resultDiv.style.color = ''; // Reset to default CSS color
        hideMessage();
        isSpinning = false; // Ensure spinning state is false
    }

    // --- UI Update Functions ---
    function updateBalanceDisplay() {
        try {
            playerBalanceSpan.textContent = playerBalance.toLocaleString();
        } catch (e) {
            console.error("Error formatting balance:", e);
            playerBalanceSpan.textContent = playerBalance.toString(); // Fallback
        }
    }

    function updateWeightsAndRedraw() {
        const greenWeight = parseInt(winRateSlider.value, 10); // Use radix 10
        // Ensure weights are non-negative (slider should handle this, but good practice)
        segments[0].weight = Math.max(0, greenWeight);
        segments[1].weight = Math.max(0, 100 - greenWeight);
        // Recalculate totalWeight (should always be 100 if slider works)
        totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
        winRateValueSpan.textContent = `${greenWeight}%`;
        drawWheel();
    }

    function drawWheel() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent-dark').trim() || '#5a3a24'; // Use CSS var
        ctx.lineWidth = 5;
        ctx.font = 'bold 12px Roboto'; // Consider CSS var for font
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let startAngle = currentAngle; // Use the current animation angle

        if (totalWeight <= 0) {
            console.warn("Total weight is zero, cannot draw segments.");
            // Draw an empty wheel outline
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, 2 * Math.PI, false);
            ctx.stroke();
            return;
        }

        // Draw segments
        segments.forEach((segment) => {
            if (segment.weight > 0) {
                const segmentArcSize = (segment.weight / totalWeight) * (2 * Math.PI);
                const endAngle = startAngle + segmentArcSize;
                ctx.fillStyle = segment.color;
                ctx.beginPath();
                // Draw segment arc
                ctx.arc(center, center, radius, startAngle, endAngle, false);
                // Draw inner arc for donut hole effect
                ctx.arc(center, center, radius * 0.3, endAngle, startAngle, true); // Inner radius factor
                ctx.closePath();
                ctx.fill();
                ctx.stroke(); // Outline each segment
                startAngle = endAngle;
             }
        });

        // Draw center circle decoration
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim() || '#8b5a2b'; // Use CSS var
        ctx.beginPath();
        ctx.arc(center, center, radius * 0.3, 0, Math.PI * 2, false); // Inner radius factor
        ctx.fill();
        ctx.stroke(); // Outline center circle
    }

    function updateHistoryDisplay() {
        historyLog.innerHTML = ''; // Clear existing entries
        // Display up to MAX_HISTORY entries, newest first
        const historyToDisplay = Array.isArray(spinHistory) ? spinHistory.slice(-MAX_HISTORY) : [];
        historyToDisplay.reverse().forEach(entry => {
            if (typeof entry !== 'object' || entry === null || !entry.result) return;

            const li = document.createElement('li');
            li.classList.add('history-entry'); // Add general class

            let outcomeText = '';
            let outcomeClass = '';
            let resultColorClass = '';

            const outcome = entry.outcome || 0n;
            const bet = entry.bet || 0n;
            const balanceAfter = entry.balanceAfter !== undefined
                                 ? entry.balanceAfter.toLocaleString()
                                 : 'N/A';

            if (outcome > 0n) {
                outcomeText = `Thắng ${outcome.toLocaleString()} G`;
                outcomeClass = HISTORY_WIN_CLASS;
                resultColorClass = HISTORY_RESULT_WIN_CLASS;
            } else {
                // Display positive loss amount
                outcomeText = `Thua ${(-outcome).toLocaleString()} G`;
                outcomeClass = HISTORY_LOSS_CLASS;
                resultColorClass = HISTORY_RESULT_LOSE_CLASS;
            }

            // Use template literal and classes for cleaner HTML structure
            li.innerHTML = `Cược ${bet.toLocaleString()} G, trúng <strong class="${resultColorClass}">${entry.result}</strong>. <span class="${outcomeClass}">${outcomeText}</span>. Còn: ${balanceAfter} G`;
            historyLog.appendChild(li);
        });
    }

    // Enable/disable controls based on game state
    function updateControlsState() {
        const canPlay = playerBalance > 0n && totalWeight > 0;
        spinButton.disabled = isSpinning || !canPlay;
        winRateSlider.disabled = isSpinning;
        betAmountInput.disabled = isSpinning || playerBalance <= 0n; // Disable bet if no balance
        // Reset button is always enabled unless spinning? Or always enabled? Let's keep it enabled.
        // resetButton.disabled = isSpinning;
    }


    // --- Reset Logic ---
    function resetGame() {
        if (isSpinning) return; // Don't reset while spinning

        try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            // console.log("Cleared saved game state (BigInt).");
        } catch (error) {
            console.error("Error removing game state from localStorage:", error);
        }

        playerBalance = INITIAL_BALANCE;
        spinHistory = [];
        currentBet = 0n; // Reset placed bet

        // Keep current win rate slider value, but update segments/wheel
        updateWeightsAndRedraw();

        // Reset bet amount input to default or balance, whichever is smaller
        let resetBetAmount = DEFAULT_BET;
        if (playerBalance <= 0n) { // Should be INITIAL_BALANCE > 0n here
            resetBetAmount = 0n;
        } else {
            resetBetAmount = DEFAULT_BET < playerBalance ? DEFAULT_BET : playerBalance;
        }
        betAmountInput.value = resetBetAmount.toString();

        updateBalanceDisplay();
        updateHistoryDisplay();

        resultDiv.textContent = '';
        resultDiv.style.color = ''; // Reset color

        updateControlsState(); // Update button states
        hideMessage(); // Ensure message box is hidden
        isSpinning = false; // Ensure spinning state is false

        console.log("Game reset. Balance/History/Bet reset. Kept Win Rate.");
    }

    // --- Spin and Bet Logic ---
    function rotateWheel() {
        const now = performance.now(); // Use high-resolution timer
        // spinTime holds the timestamp of the *previous* frame
        // elapsed is the time since the previous frame
        const elapsed = now - spinTime;
        spinTime = now; // Update spinTime to current frame's timestamp

        // Calculate total time elapsed since the spin started
        const totalElapsed = now - spinStartTime;
        const timeFraction = Math.min(1, totalElapsed / spinTimeTotal); // Progress from 0 to 1

        if (timeFraction >= 1) {
            stopRotateWheel();
            return;
        }

        // Apply easing function (easeOutSine)
        const easingProgress = Math.sin(timeFraction * EASE_OUT_FACTOR);
        // Calculate current speed based on easing (derivative of position) - speed decreases
        // Note: This speed calculation might need adjustment depending on desired feel
        const currentSpeed = spinAngleStartSpeed * Math.cos(timeFraction * EASE_OUT_FACTOR);

        // Update angle based on speed and time delta (more accurate than fixed increment)
        // Convert speed (degrees/frame assumed) to radians/ms for calculation
        // The (elapsed / (1000/60)) part tries to normalize based on a 60fps assumption,
        // but it's better to calculate increment directly based on elapsed time in ms.
        // Let's assume spinAngleStartSpeed is in radians per second for simplicity here.
        // Adjust the constants MIN/RANDOM_SPIN_ANGLE_SPEED if changing this assumption.
        // Example: If speed is rad/sec, increment is speed * (elapsed / 1000)
        // If speed is degrees/sec, increment is speed * (PI/180) * (elapsed / 1000)

        // Let's stick to the original intent (speed factor related to degrees/frame)
        // and use elapsed time for smoother animation regardless of frame rate.
        // Convert speed factor to radians/ms approximately
        const speedRadPerMs = (currentSpeed * Math.PI / 180) / (1000 / 60); // Approx conversion
        const angleIncrement = speedRadPerMs * elapsed;

        currentAngle += angleIncrement; // Add increment in radians

        drawWheel();
        animationFrameId = requestAnimationFrame(rotateWheel); // Continue animation
    }

    function stopRotateWheel() {
        cancelAnimationFrame(animationFrameId); // Stop requesting frames
        animationFrameId = null;
        isSpinning = false;
        // spinTime = 0; // Resetting spinTime isn't strictly necessary here

        // Ensure the final angle is drawn correctly (might be slightly off due to frame timing)
        // We could calculate the exact final angle based on spinTimeTotal, but modulo is easier
        currentAngle %= (2 * Math.PI); // Normalize angle
        drawWheel(); // Draw final position

        // Determine winning segment
        const finalAngle = currentAngle;
        const pointerAngle = (3 * Math.PI / 2); // Top pointer position in radians
        let relativeAngle = pointerAngle - finalAngle; // Angle relative to pointer
        relativeAngle = (relativeAngle % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI); // Normalize to 0 to 2PI

        let cumulativeAngle = 0;
        let winningSegment = null;

        if (totalWeight <= 0) {
             resultDiv.textContent = "Lỗi!";
             resultDiv.style.color = TEXT_COLOR_LOSE; // Use constant
             updateControlsState();
             return;
        }

        for (const segment of segments) {
             if (segment.weight > 0) {
                const segmentArcSize = (segment.weight / totalWeight) * (2 * Math.PI);
                // Check if the relative angle falls within this segment's arc
                // Add a small epsilon for floating point comparisons
                if (relativeAngle <= cumulativeAngle + segmentArcSize + 1e-9) {
                    winningSegment = segment;
                    break;
                }
                cumulativeAngle += segmentArcSize;
             }
        }
         // Fallback if no segment found (shouldn't happen with valid weights)
         if (!winningSegment) {
             console.error("Could not determine winning segment!");
             winningSegment = segments.find(s => s.weight > 0) || segments[0]; // Pick first valid or first overall
         }

        // Process win/loss result
        let outcomeAmount = 0n;
        if (winningSegment.label === 'Xanh lá') {
            const winnings = currentBet * 2n;
            playerBalance += winnings;
            outcomeAmount = currentBet; // Net gain is the bet amount
            resultDiv.textContent = `Thắng! Bạn nhận được ${winnings.toLocaleString()} G!`;
            resultDiv.style.color = TEXT_COLOR_WIN; // Use constant
        } else {
            outcomeAmount = -currentBet; // Net loss is the bet amount
            // Balance was already deducted before spin
            resultDiv.textContent = `Thua! Bạn mất ${currentBet.toLocaleString()} G.`;
            resultDiv.style.color = TEXT_COLOR_LOSE; // Use constant
        }

        updateBalanceDisplay(); // Update display before saving history/state

        // Add result to history
        spinHistory.unshift({ // Add to the beginning for newest first
            result: winningSegment.label,
            color: winningSegment.color,
            bet: currentBet,
            outcome: outcomeAmount,
            balanceAfter: playerBalance
        });
        if (spinHistory.length > MAX_HISTORY) {
            spinHistory.pop(); // Remove oldest entry if exceeding max
        }
        updateHistoryDisplay();

        saveGameState(); // Save state AFTER the spin completes and history is updated

        updateControlsState(); // Re-enable controls based on new balance

        // Check if out of money
        if (playerBalance <= 0n) {
            showMessage("Bạn đã hết vàng! Nhấn 'Chơi lại' để bắt đầu lại.");
        }
    }

    // --- Event Listeners ---
    spinButton.addEventListener('click', () => {
        if (isSpinning || playerBalance <= 0n || totalWeight <= 0) return;

        const betValue = parseBetInput(betAmountInput);

        // Validate bet amount
        if (betValue === null) {
            showMessage("Vui lòng nhập số tiền cược hợp lệ (chỉ gồm số).");
            // Correct the input to a valid minimum or the balance
            betAmountInput.value = (playerBalance > 0n ? MIN_BET : 0n).toString();
            return;
        }
        if (betValue < MIN_BET) {
            showMessage(`Vui lòng nhập số tiền cược ít nhất là ${MIN_BET.toLocaleString()} G.`);
            betAmountInput.value = MIN_BET.toString(); // Correct input
            return;
        }
        if (betValue > playerBalance) {
            showMessage(`Bạn không đủ vàng! Vàng hiện tại: ${playerBalance.toLocaleString()} G.`);
            betAmountInput.value = playerBalance.toString(); // Correct input
            return;
        }

        // Bet is valid, start the spin process
        currentBet = betValue; // Store the confirmed bet
        playerBalance -= currentBet;
        updateBalanceDisplay();
        saveGameState(); // Save state immediately after bet deduction

        isSpinning = true;
        updateControlsState(); // Disable controls

        resultDiv.textContent = 'Đang quay...';
        resultDiv.style.color = TEXT_COLOR_NEUTRAL; // Use constant

        // Calculate spin parameters
        spinAngleStartSpeed = Math.random() * RANDOM_SPIN_ANGLE_SPEED + MIN_SPIN_ANGLE_SPEED;
        spinTimeTotal = Math.random() * RANDOM_SPIN_DURATION + MIN_SPIN_DURATION;
        spinStartTime = performance.now(); // Record start time
        spinTime = spinStartTime; // Initialize spinTime for first frame calculation

        if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel previous frame if any
        animationFrameId = requestAnimationFrame(rotateWheel); // Start animation loop
    });

    resetButton.addEventListener('click', resetGame);

    winRateSlider.addEventListener('input', () => {
        if (!isSpinning) {
            updateWeightsAndRedraw();
            updateControlsState(); // Check if spinning becomes impossible (weight 0)
            saveGameState(); // Save changed winRate
        }
    });

    // Validate bet input dynamically
    betAmountInput.addEventListener('input', () => {
        if (isSpinning) return;

        const betValue = parseBetInput(betAmountInput); // Use helper, allows null

        if (betValue !== null) { // Only validate if it's a parsable number
            let correctedValue = betValue;
            const minBetAllowed = playerBalance > 0n ? MIN_BET : 0n;

            if (betValue < minBetAllowed) {
                // Don't correct immediately to allow typing '0' then '1'
                // Correction will happen on blur or spin attempt if left invalid
            } else if (betValue > playerBalance) {
                correctedValue = playerBalance;
                betAmountInput.value = correctedValue.toString(); // Correct oversized bet immediately
            }
        } else if (betAmountInput.value.trim() !== '' && !/^\d*$/.test(betAmountInput.value)) {
            // If non-empty and contains non-digits, revert or clear?
            // Let's revert to a safe minimum for now.
             console.warn("Invalid characters detected in bet input.");
             betAmountInput.value = (playerBalance > 0n ? MIN_BET : 0n).toString();
        }
        // Note: No saveGameState() here - avoid saving on every keystroke.
    });

    // Final validation/correction on losing focus
    betAmountInput.addEventListener('blur', () => {
        if (isSpinning) return;

        const betValue = parseBetInput(betAmountInput);
        let correctedValueStr;

        if (playerBalance <= 0n) {
            correctedValueStr = '0';
        } else {
            if (betValue === null || betValue < MIN_BET) {
                // If input is invalid, empty, or below min, set to MIN_BET
                correctedValueStr = MIN_BET.toString();
            } else if (betValue > playerBalance) {
                // If input exceeds balance, set to balance
                correctedValueStr = playerBalance.toString();
            } else {
                // Value is valid and within range, keep it
                correctedValueStr = betValue.toString();
            }
        }

        // Update input field only if correction was needed
        if (betAmountInput.value !== correctedValueStr) {
            betAmountInput.value = correctedValueStr;
        }
        // Save state when focus is lost and value is finalized (optional)
        // saveGameState();
    });


    // Message Box Event Listeners
    messageCloseButton.onclick = hideMessage;
    messageBoxOverlay.onclick = (event) => {
         // Close only if clicking the overlay itself, not the box inside
         if (event.target === messageBoxOverlay) {
            hideMessage();
         }
    };

    // --- Initialization ---
    // Use DOMContentLoaded for faster initialization after HTML is parsed
    document.addEventListener('DOMContentLoaded', loadGameState);

})(); // End of IIFE
