
        const API_BASE_URL = '/api';
        
        let rawPickingData = [];
        let pickingData = [];
        let hourlyData = {};
        let pickerTotals = {};
        let pickerValueTotals = {};
        let pickersDatabase = [];
        let dispatchPlanData = [];
        let allOrders = [];
        let wmsBlData = [];
        let globalDayStartHour = 0;
        let currentShiftFilter = 'All';
        let currentTypeFilter = 'All';
        let displayMode = 'QTY';
        let dashboardConfig = { dayStartHour: 3, dailyGoalQty: 10000, dailyGoalValue: 5000000 };

        function setDisplayMode(mode) {
            displayMode = mode;
            document.querySelectorAll('.display-mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent === mode);
            });
            
            const isQty = mode === 'QTY';
            
            // Update labels
            const totalLabel = document.getElementById('total-orders-qty');
            if (totalLabel) totalLabel.previousElementSibling.textContent = isQty ? 'Total Orders Qty' : 'Total Orders Est. Value';
            
            const pickedLabel = document.getElementById('picked-qty');
            if (pickedLabel) pickedLabel.previousElementSibling.textContent = isQty ? 'Completed Qty' : 'Completed Value';
            
            const pendingLabel = document.getElementById('pending-qty');
            if (pendingLabel) pendingLabel.previousElementSibling.textContent = isQty ? 'Pending Qty' : 'Pending Value';
            
            const ongoingLabel = document.getElementById('ongoing-qty');
            if (ongoingLabel) ongoingLabel.previousElementSibling.textContent = isQty ? 'On-Going Qty' : 'On-Going Value';
            
            const invoicedLabel = document.getElementById('invoiced-qty');
            if (invoicedLabel) invoicedLabel.previousElementSibling.textContent = isQty ? 'Invoiced Qty' : 'Invoiced Value';
            
            updateDashboard();
        }

        function setShiftFilter(shift) {
            currentShiftFilter = shift;
            document.querySelectorAll('.shift-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent.includes(shift) || (shift === 'All' && btn.textContent === 'Overall'));
            });
            if (rawPickingData.length > 0) {
                processData();
                try { renderDashboard(); } catch (e) { console.error('Error re-rendering dashboard:', e); }
            }
        }

        function setTypeFilter(type) {
            currentTypeFilter = type;
            document.querySelectorAll('.type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent.includes(type) || (type === 'All' && btn.textContent === 'All Types'));
            });
            updateDashboard();
        }

        // Color palette matching the dashboard image
        const PICKER_COLORS = [
            '#4299e1', // Blue
            '#48bb78', // Green
            '#ed8936', // Orange  
            '#9f7aea', // Purple
            '#f56565', // Red
            '#38b2ac', // Teal
            '#f687b3', // Pink
            '#ecc94b'  // Yellow
        ];

        async function loadDashboardData() {
            try {
                const [ordersRes, pickersRes, dispatchRes, configRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/picking-orders`),
                    fetch(`${API_BASE_URL}/pickers`),
                    fetch(`${API_BASE_URL}/dispatch-plan`),
                    fetch(`${API_BASE_URL}/config?t=${Date.now()}`)
                ]);

                allOrders = await ordersRes.json().catch(() => []);
                pickersDatabase = await pickersRes.json().catch(() => []);
                dispatchPlanData = (await dispatchRes.json().catch(() => [])).filter(item => item.archiveStatus !== 'Archived');

                const config = await configRes.json().catch(() => ({ dayStartHour: 3, dailyGoalQty: 10000, dailyGoalValue: 5000000 }));
                dashboardConfig = config;
                const dayStartHour = config.dayStartHour !== undefined ? config.dayStartHour : 3;
                globalDayStartHour = dayStartHour;

                updateDashboard();
                document.getElementById('last-update').textContent = `Live Sync ${new Date().toLocaleTimeString()}`;
            } catch (error) {
                console.error('Error loading data:', error);
                document.getElementById('last-update').textContent = 'Error loading data';
            }

            // WMS cards load independently — never blocks or crashes the main dashboard
            AuthGuard.authFetch(`${API_BASE_URL}/outbound-bl-data`)
                .then(r => r.json())
                .then(data => { wmsBlData = Array.isArray(data) ? data : []; updateWmsCards(); })
                .catch(() => {});
        }

        function updateWmsCards() {
            const safeWms = Array.isArray(wmsBlData) ? wmsBlData : [];
            const wmsOpQty = safeWms.reduce((s, r) => s + (parseInt(r.operatorQty) || 0), 0);
            const wmsPkQty = safeWms.reduce((s, r) => s + (parseInt(r.pickerQty) || 0), 0);
            const wmsTotal = wmsOpQty + wmsPkQty;
            const fmtPct = (v) => wmsTotal > 0
                ? `${((v / wmsTotal) * 100).toFixed(1)}% of ${wmsTotal.toLocaleString()} WMS total`
                : `${safeWms.length} BL lines`;
            const wmsOpEl  = document.getElementById('wms-operator-qty');
            const wmsPkEl  = document.getElementById('wms-picker-qty');
            const wmsOpPct = document.getElementById('wms-operator-pct');
            const wmsPkPct = document.getElementById('wms-picker-pct');
            if (wmsOpEl)  wmsOpEl.textContent  = wmsOpQty.toLocaleString();
            if (wmsPkEl)  wmsPkEl.textContent  = wmsPkQty.toLocaleString();
            if (wmsOpPct) wmsOpPct.textContent = fmtPct(wmsOpQty);
            if (wmsPkPct) wmsPkPct.textContent = fmtPct(wmsPkQty);
        }

        function updateDashboard() {
            const orders = allOrders;
            const dispatchPlan = dispatchPlanData;
            
            const getLogicalDateStr = (dateInput) => {
                const d = new Date(dateInput || new Date());
                d.setHours(d.getHours() - globalDayStartHour);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            const today = getLogicalDateStr();
            
            // Main plan excludes Archived Orders
            // Also apply Type filter!
            const mainDispatchPlan = dispatchPlan.filter(d => {
                const status = (d.status || '').trim().toLowerCase();
                const statusMatch = status !== 'archive order' && status !== 'archived order';
                const typeMatch = currentTypeFilter === 'All' || d.type === currentTypeFilter;
                return statusMatch && typeMatch;
            });

            // Today's Target plan: Pending Plan, Today's Plan, Unconfirmed Plan
            const todaysTargetPlan = dispatchPlan.filter(d => {
                const status = (d.status || '').trim().toLowerCase();
                const statusMatch = status === 'pending plan' || status === "today's plan" || status === 'unconfirmed plan';
                const typeMatch = currentTypeFilter === 'All' || d.type === currentTypeFilter;
                return statusMatch && typeMatch;
            });
            
            const activeCompletedPicks = (Array.isArray(orders) ? orders : []).filter(o =>
                o.status === 'completed' &&
                mainDispatchPlan.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
            );

            // Target-scoped picks: only count completions that belong to the target plan (Pending/Today's/Additional)
            const targetCompletedPicks = (Array.isArray(orders) ? orders : []).filter(o =>
                o.status === 'completed' &&
                todaysTargetPlan.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
            );
            
            const ongoingPicks = (Array.isArray(orders) ? orders : []).filter(o => 
                o.status === 'in-progress' && 
                mainDispatchPlan.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
            );

            function formatValue(val) {
                if (displayMode === 'QTY') {
                    return val.toLocaleString();
                } else {
                    if (val >= 100000) { // Use Millions for 100k and above
                        return '₱' + (val / 1000000).toFixed(1) + 'M';
                    } else {
                        return '₱' + Math.round(val).toLocaleString();
                    }
                }
            }

            let totalOrdersQty, pickedQty, ongoingQty, pendingQty;
            
            // Always calculate Invoiced Value unconditionally
            const invoicedValueTotal = mainDispatchPlan.reduce((sum, d) => {
                const rawVal = String(d.invoicedValue || '').replace(/[^0-9.-]+/g, '');
                return sum + (parseFloat(rawVal) || 0);
            }, 0);

            // Always calculate Invoiced Qty unconditionally
            const invoicedQtyTotal = mainDispatchPlan.reduce((sum, d) => {
                const rawVal = String(d.invoicedValue || '').replace(/[^0-9.-]+/g, '');
                const hasInvoice = (parseFloat(rawVal) || 0) > 0;
                return sum + (hasInvoice ? (parseInt(d.qty) || 0) : 0);
            }, 0);

            // Always calculate Picked Value (for Goal progress)
            const pickedValueTotal = activeCompletedPicks.reduce((sum, o) => {
                const d = mainDispatchPlan.find(dp => String(dp.fo) === String(o.foNumber) && String(dp.accountName) === String(o.accountName));
                if (d && d.qty > 0) {
                    return sum + (o.pickerQty * (d.estAmount / d.qty));
                }
                return sum;
            }, 0);

            if (displayMode === 'QTY') {
                totalOrdersQty = mainDispatchPlan.reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);
                pickedQty = activeCompletedPicks.reduce((sum, o) => sum + (parseInt(o.pickerQty) || 0), 0);
                ongoingQty = ongoingPicks.reduce((sum, o) => sum + (parseInt(o.pickerQty) || 0), 0);
                pendingQty = Math.max(0, totalOrdersQty - pickedQty - ongoingQty);
            } else {
                totalOrdersQty = mainDispatchPlan.reduce((sum, d) => sum + (d.estAmount || 0), 0);
                pickedQty = pickedValueTotal;
                ongoingQty = ongoingPicks.reduce((sum, o) => {
                    const d = mainDispatchPlan.find(dp => String(dp.fo) === String(o.foNumber) && String(dp.accountName) === String(o.accountName));
                    if (d && d.qty > 0) {
                        return sum + (o.pickerQty * (d.estAmount / d.qty));
                    }
                    return sum;
                }, 0);
                pendingQty = Math.max(0, totalOrdersQty - pickedQty - ongoingQty);
            }
            
            // Calculate order counts for subtitles
            const pickedOrdersCount = new Set(activeCompletedPicks.map(o => `${o.foNumber}|${o.partyCode}`)).size;
            const ongoingOrdersCount = new Set(ongoingPicks.map(o => `${o.foNumber}|${o.partyCode}`)).size;
            const pendingOrdersCount = Math.max(0, mainDispatchPlan.length - pickedOrdersCount - ongoingOrdersCount);

            // Individual Status Group Breakdowns
            const getStatusBreakdown = (statusMatchStr) => {
                const statusFOs = dispatchPlan.filter(d => 
                    (d.status || '').trim().toLowerCase() === statusMatchStr.toLowerCase() &&
                    (currentTypeFilter === 'All' || d.type === currentTypeFilter)
                );
                
                let planVal, pickedVal, pendingVal;
                
                if (displayMode === 'QTY') {
                    planVal = statusFOs.reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);
                    
                    const completedPicks = (Array.isArray(orders) ? orders : []).filter(o => 
                        o.status === 'completed' && 
                        statusFOs.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
                    );
                    pickedVal = completedPicks.reduce((sum, o) => sum + (parseInt(o.pickerQty) || 0), 0);
                    pendingVal = Math.max(0, planVal - pickedVal);
                } else {
                    planVal = statusFOs.reduce((sum, d) => sum + (d.estAmount || 0), 0);
                    
                    const completedPicks = (Array.isArray(orders) ? orders : []).filter(o => 
                        o.status === 'completed' && 
                        statusFOs.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
                    );
                    pickedVal = completedPicks.reduce((sum, o) => {
                        const d = statusFOs.find(dp => String(dp.fo) === String(o.foNumber) && String(dp.accountName) === String(o.accountName));
                        if (d && d.qty > 0) {
                            return sum + (o.pickerQty * (d.estAmount / d.qty));
                        }
                        return sum;
                    }, 0);
                    pendingVal = Math.max(0, planVal - pickedVal);
                }
                
                const planCount = statusFOs.length;
                const completedPicksForCount = (Array.isArray(orders) ? orders : []).filter(o => 
                    o.status === 'completed' && 
                    statusFOs.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
                );
                const pickedCount = new Set(completedPicksForCount.map(o => `${o.foNumber}|${o.partyCode}`)).size;
                const pendingCount = Math.max(0, planCount - pickedCount);
                
                return { planQty: planVal, planCount, pickedQty: pickedVal, pickedCount, pendingQty: pendingVal, pendingCount };
            };

            const pendingStats = getStatusBreakdown('Pending Plan');
            const todayStats = getStatusBreakdown("Today's Plan");
            const tomorrowStats = getStatusBreakdown("Tomorrow's Plan");

            const assignStat = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = formatValue(val);
            };

            const assignText = (id, txt) => {
                const el = document.getElementById(id);
                if (el) el.textContent = txt;
            };

            assignStat('status-pending-plan-qty', pendingStats.planQty);
            assignText('status-pending-plan-count', `${pendingStats.planCount} orders`);
            assignStat('status-pending-picked-qty', pendingStats.pickedQty);
            assignText('status-pending-picked-count', `${pendingStats.pickedCount} orders`);
            assignStat('status-pending-pending-qty', pendingStats.pendingQty);
            assignText('status-pending-pending-count', `${pendingStats.pendingCount} orders`);

            assignStat('status-today-plan-qty', todayStats.planQty);
            assignText('status-today-plan-count', `${todayStats.planCount} orders`);
            assignStat('status-today-picked-qty', todayStats.pickedQty);
            assignText('status-today-picked-count', `${todayStats.pickedCount} orders`);
            assignStat('status-today-pending-qty', todayStats.pendingQty);
            assignText('status-today-pending-count', `${todayStats.pendingCount} orders`);

            assignStat('status-tomorrow-plan-qty', tomorrowStats.planQty);
            assignText('status-tomorrow-plan-count', `${tomorrowStats.planCount} orders`);
            assignStat('status-tomorrow-picked-qty', tomorrowStats.pickedQty);
            assignText('status-tomorrow-picked-count', `${tomorrowStats.pickedCount} orders`);
            assignStat('status-tomorrow-pending-qty', tomorrowStats.pendingQty);
            assignText('status-tomorrow-pending-count', `${tomorrowStats.pendingCount} orders`);



            // Estimated Completion Time
            const todaysPicks = (Array.isArray(orders) ? orders : []).filter(o => 
                getLogicalDateStr(o.startTime) === today &&
                mainDispatchPlan.some(d => String(d.fo) === String(o.foNumber) && String(d.accountName) === String(o.accountName))
            );
            let estHoursStr = "-";
            let estTimeStr = "-";

            if (todaysPicks.length > 0 && pickedQty > 0) {
                const earliestStartMs = Math.min(...todaysPicks.map(o => new Date(o.startTime).getTime()));
                const elapsedMs = Date.now() - earliestStartMs;
                const elapsedHours = elapsedMs / (1000 * 60 * 60);

                if (elapsedHours > 0) {
                    const picksPerHour = pickedQty / elapsedHours;
                    const remainingQty = pendingQty + ongoingQty;
                    if (picksPerHour > 0) {
                        const hoursRemaining = remainingQty / picksPerHour;
                        estHoursStr = hoursRemaining.toFixed(1) + " hrs";

                        const completionDate = new Date(Date.now() + (hoursRemaining * 60 * 60 * 1000));
                        estTimeStr = completionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }
                }
            }

            assignStat('total-orders-qty', totalOrdersQty);
            assignStat('picked-qty', pickedQty);

            // Format Invoiced based on Display Mode
            const invoicedEl = document.getElementById('invoiced-qty');
            if (invoicedEl) {
                const invoicedValueToShow = displayMode === 'QTY' ? invoicedQtyTotal : invoicedValueTotal;
                invoicedEl.textContent = formatValue(invoicedValueToShow);
            }

            assignStat('pending-qty', pendingQty);
            assignStat('ongoing-qty', ongoingQty);

            const totalOrdersCountEl = document.getElementById('total-orders-count');
            if (totalOrdersCountEl) totalOrdersCountEl.textContent = `${mainDispatchPlan.length} orders`;
            
            const compPercent = totalOrdersQty > 0 ? ((pickedQty / totalOrdersQty) * 100).toFixed(1) : '0.0';
            const pickedOrdersCountEl = document.getElementById('picked-orders-count');
            if (pickedOrdersCountEl) pickedOrdersCountEl.textContent = `${pickedOrdersCount} orders completed (${compPercent}%)`;

            const invoicedOrdersCount = new Set(mainDispatchPlan.filter(d => {
                const rawVal = String(d.invoicedValue || '').replace(/[^0-9.-]+/g, '');
                return parseFloat(rawVal) > 0;
            }).map(d => `${d.fo}|${d.partyCode}`)).size;
            
            const totalOrdersValueTotal = mainDispatchPlan.reduce((sum, d) => sum + (d.estAmount || 0), 0);
            let invoicedPercent = '0.0';
            if (displayMode === 'QTY') {
                invoicedPercent = totalOrdersQty > 0 ? ((invoicedQtyTotal / totalOrdersQty) * 100).toFixed(1) : '0.0';
            } else {
                invoicedPercent = totalOrdersValueTotal > 0 ? ((invoicedValueTotal / totalOrdersValueTotal) * 100).toFixed(1) : '0.0';
            }
            const invoicedOrdersCountEl = document.getElementById('invoiced-orders-count');
            if (invoicedOrdersCountEl) invoicedOrdersCountEl.textContent = `${invoicedOrdersCount} orders invoiced (${invoicedPercent}%)`;

            // Update Goal Progress (Toggled based on displayMode)
            const targetTitleEl = document.getElementById('todays-target-title');
            if (targetTitleEl) {
                const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                targetTitleEl.textContent = `Today's Target - ${todayStr}`;
            }

            // --- Today's Target calculations ---
            // Use todaysTargetPlan (Pending + Today's + Additional) to derive target qty
            const targetPlanTotalVal = todaysTargetPlan.reduce((sum, d) => sum + (d.estAmount || 0), 0);
            const targetPlanTotalQty = todaysTargetPlan.reduce((sum, d) => sum + (parseInt(d.qty) || 0), 0);
            const targetAvgValuePerQty = (targetPlanTotalQty > 0) ? (targetPlanTotalVal / targetPlanTotalQty) : 2500;

            // Target-scoped picked values
            const targetPickedQty = targetCompletedPicks.reduce((sum, o) => sum + (parseInt(o.pickerQty) || 0), 0);
            const targetPickedValue = targetCompletedPicks.reduce((sum, o) => {
                const d = todaysTargetPlan.find(dp => String(dp.fo) === String(o.foNumber) && String(dp.accountName) === String(o.accountName));
                if (d && d.qty > 0) {
                    return sum + (o.pickerQty * (d.estAmount / d.qty));
                }
                return sum;
            }, 0);

            const targetValue = dashboardConfig.dailyGoalValue > 0 ? dashboardConfig.dailyGoalValue : targetPlanTotalVal;

            let goalValue, goalPercent, formattedCurrent, formattedGoal;
            if (displayMode === 'QTY') {
                goalValue = targetPlanTotalQty;
                goalPercent = goalValue > 0 ? ((targetPickedQty / goalValue) * 100).toFixed(1) : '0.0';
                formattedCurrent = targetPickedQty.toLocaleString();
                formattedGoal = goalValue.toLocaleString();
            } else {
                goalValue = targetValue;
                goalPercent = goalValue > 0 ? ((targetPickedValue / goalValue) * 100).toFixed(1) : '0.0';
                formattedCurrent = '₱' + (targetPickedValue / 1000000).toFixed(2) + 'M';
                formattedGoal = '₱' + (goalValue / 1000000).toFixed(2) + 'M';
            }

            const progressTextEl = document.getElementById('goal-progress-text');
            if (progressTextEl) progressTextEl.textContent = `${formattedCurrent} / ${formattedGoal} (${goalPercent}%)`;
            
            // Update Set Goal Button visibility
            const editBtn = document.getElementById('edit-goal-btn');
            if (editBtn && window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'client')) {
                editBtn.style.display = displayMode === 'VALUE' ? 'inline-block' : 'none';
            } else if (editBtn) {
                editBtn.style.display = 'none';
            }
            const fillWidth = Math.min(100, Math.max(0, parseFloat(goalPercent)));
            const fillEl = document.getElementById('goal-progress-fill');
            if (fillEl) fillEl.style.width = `${fillWidth}%`;
            
            const pendingOrdersCountEl = document.getElementById('pending-orders-count');
            if (pendingOrdersCountEl) pendingOrdersCountEl.textContent = `${pendingOrdersCount} pending orders`;

            const ongoingOrdersCountEl = document.getElementById('ongoing-orders-count');
            if (ongoingOrdersCountEl) ongoingOrdersCountEl.textContent = `${ongoingOrdersCount} on-going orders`;

            const estHoursEl = document.getElementById('est-completion-hours');
            if (estHoursEl) estHoursEl.textContent = estHoursStr;
            const estTimeEl = document.getElementById('est-completion-time');
            if (estTimeEl) estTimeEl.textContent = estTimeStr;

            // Filter today's completed orders for performance stats
            rawPickingData = (Array.isArray(orders) ? orders : []).filter(o => 
                o.status === 'completed' && 
                getLogicalDateStr(o.startTime) === today
            );

            processData();
            try {
                renderDashboard();
            } catch (renderError) {
                console.error('Error rendering dashboard:', renderError);
            }
        }

        function getBucketedHour(order) {
            const timeToUse = (order.status === 'completed' && order.endTime) ? new Date(order.endTime) : new Date(order.startTime);
            if (isNaN(timeToUse.getTime())) return null;
            
            let hour = timeToUse.getHours();
            
            // Break rule: if pick is done within the break, fall to nearest hour
            if (hour === 12) {
                const minutes = timeToUse.getMinutes();
                hour = minutes <= 30 ? 11 : 13;
            }
            if (hour === 18) {
                const minutes = timeToUse.getMinutes();
                hour = minutes <= 30 ? 17 : 19;
            }
            return hour;
        }

        function processData() {
            // Calculate totals per picker
            pickerTotals = {};
            pickerValueTotals = {};
            hourlyData = {};

            if (!Array.isArray(rawPickingData)) return;

            pickingData = (Array.isArray(rawPickingData) ? rawPickingData : []).filter(order => {
                // Find corresponding dispatch plan item to get Type
                const dispatchItem = dispatchPlanData.find(d => String(d.fo) === String(order.foNumber) && String(d.accountName) === String(order.accountName));
                const orderType = dispatchItem ? dispatchItem.type : '';

                // Shift filter
                let shiftMatch = true;
                if (currentShiftFilter !== 'All') {
                    const picker = (Array.isArray(pickersDatabase) ? pickersDatabase : []).find(p => p.code === order.pickerCode);
                    shiftMatch = picker && picker.shift === currentShiftFilter;
                }

                // Type filter
                let typeMatch = true;
                if (currentTypeFilter !== 'All') {
                    typeMatch = orderType === currentTypeFilter;
                }

                return shiftMatch && typeMatch;
            });

            pickingData.forEach(order => {
                if (!order || !order.pickerCode || !order.startTime) return;
                
                const picker = order.pickerCode;
                const hour = getBucketedHour(order);
                if (hour === null) return;
                
                // Total per picker
                if (!pickerTotals[picker]) {
                    pickerTotals[picker] = 0;
                    pickerValueTotals[picker] = 0;
                }
                const qty = parseInt(order.pickerQty) || 0;
                pickerTotals[picker] += qty;

                // Estimate Value for this pick
                const d = dispatchPlanData.find(dp => String(dp.fo) === String(order.foNumber) && String(dp.accountName) === String(order.accountName));
                if (d && d.qty > 0) {
                    pickerValueTotals[picker] += qty * (d.estAmount / d.qty);
                }

                // Hourly breakdown
                if (!hourlyData[picker]) {
                    hourlyData[picker] = {};
                }
                if (!hourlyData[picker][hour]) {
                    hourlyData[picker][hour] = 0;
                }
                hourlyData[picker][hour] += (parseInt(order.pickerQty) || 0);
            });
        }

        function renderDashboard() {
            renderStats();
            renderHourlyTable();
            renderCharts();
        }

        function renderStats() {
            const totalPicks = Object.values(pickerTotals).reduce((sum, val) => sum + val, 0);
            
            const uniquePickers = new Set();
            const uniqueOperators = new Set();
            let pickerQty = 0;
            let operatorQty = 0;
            let pickerVal = 0;
            let operatorVal = 0;

            Object.entries(pickerTotals).forEach(([code, total]) => {
                const staff = pickersDatabase.find(p => p.code === code);
                if (staff) {
                    const valTotal = pickerValueTotals[code] || 0;
                    if (staff.designation === 'Picker') {
                        uniquePickers.add(code);
                        pickerQty += total;
                        pickerVal += valTotal;
                    } else if (staff.designation === 'Operator') {
                        uniqueOperators.add(code);
                        operatorQty += total;
                        operatorVal += valTotal;
                    }
                }
            });

            const avgPicker = uniquePickers.size > 0 ? Math.round(pickerQty / uniquePickers.size) : 0;
            const avgOperator = uniqueOperators.size > 0 ? Math.round(operatorQty / uniqueOperators.size) : 0;

            const pickerStaffCountEl = document.getElementById('picker-staff-count');
            if (pickerStaffCountEl) pickerStaffCountEl.textContent = `${uniquePickers.size} Pickers`;
            
            const operatorStaffCountEl = document.getElementById('operator-staff-count');
            if (operatorStaffCountEl) operatorStaffCountEl.textContent = `${uniqueOperators.size} Operators`;

            // Find top performer
            let topPicker = '-';
            let topCount = 0;
            Object.entries(pickerTotals).forEach(([picker, count]) => {
                if (count > topCount) {
                    topPicker = picker;
                    topCount = count;
                }
            });

            // Find peak hour
            const hourTotals = {};
            Object.values(hourlyData).forEach(pickerHours => {
                Object.entries(pickerHours).forEach(([hour, count]) => {
                    if (!hourTotals[hour]) hourTotals[hour] = 0;
                    hourTotals[hour] += count;
                });
            });

            let peakHour = '-';
            let peakCount = 0;
            Object.entries(hourTotals).forEach(([hour, count]) => {
                if (count > peakCount) {
                    peakHour = `${hour}:00`;
                    peakCount = count;
                }
            });

            const totalPicksEl = document.getElementById('total-picks');
            if (totalPicksEl) totalPicksEl.textContent = totalPicks.toLocaleString();
            
            const totalStaffEl = document.getElementById('total-pickers');
            if (totalStaffEl) totalStaffEl.textContent = `${uniquePickers.size + uniqueOperators.size} staff active`;
            
            // helper to format values
            function formatVal(val) {
                if (displayMode === 'QTY') {
                    return val.toLocaleString();
                } else {
                    if (val >= 100000) {
                        return '₱' + (val / 1000000).toFixed(1) + 'M';
                    } else {
                        return '₱' + Math.round(val).toLocaleString();
                    }
                }
            }

            const avgPickerEl = document.getElementById('avg-picker');
            if (avgPickerEl) avgPickerEl.textContent = formatVal(displayMode === 'QTY' ? pickerQty : pickerVal);
            
            const avgOperatorEl = document.getElementById('avg-operator');
            if (avgOperatorEl) avgOperatorEl.textContent = formatVal(displayMode === 'QTY' ? operatorQty : operatorVal);
            
            const topPickerEl = document.getElementById('top-picker');
            if (topPickerEl) topPickerEl.textContent = topPicker;
            
            const topCountEl = document.getElementById('top-picker-count');
            if (topCountEl) topCountEl.textContent = `${topCount.toLocaleString()} picks`;
            
            const peakHourEl = document.getElementById('peak-hour');
            if (peakHourEl) peakHourEl.textContent = peakHour;
            
            const peakCountEl = document.getElementById('peak-hour-count');
            if (peakCountEl) peakCountEl.textContent = `${peakCount.toLocaleString()} picks`;
        }

        function getPersistentHours() {
            const rawHours = pickingData.map(o => getBucketedHour(o));
            const activeHours = [...new Set(rawHours.filter(h => h !== null))];
            
            if (activeHours.length === 0) return [];

            const sortLogic = (a, b) => {
                let aVal = a < globalDayStartHour ? a + 24 : a;
                let bVal = b < globalDayStartHour ? b + 24 : b;
                return aVal - bVal;
            };
            activeHours.sort(sortLogic);
            
            const hours = [];
            let minHour = activeHours[0];
            const currentHourRaw = new Date().getHours();
            
            let h = minHour;
            while (true) {
                if (h !== 12 && h !== 18) {
                    hours.push(h);
                }
                if (h === currentHourRaw) break;
                h = (h + 1) % 24;
                if (hours.length >= 24) break;
            }
            return hours;
        }

        function renderHourlyTable() {
            const pickers = Object.keys(pickerTotals);
            const hours = getPersistentHours();

            const pickerStaff = pickers.filter(code => {
                const s = pickersDatabase.find(p => p.code === code);
                return s && s.designation === 'Picker';
            });

            const operatorStaff = pickers.filter(code => {
                const s = pickersDatabase.find(p => p.code === code);
                return s && s.designation === 'Operator';
            });

            // Render both tables
            renderRoleTable('picker', pickerStaff, hours);
            renderRoleTable('operator', operatorStaff, hours);
        }

        function renderRoleTable(prefix, staffCodes, hours) {
            const headerEl = document.getElementById(`${prefix}-hourly-header`);
            const bodyEl = document.getElementById(`${prefix}-hourly-body`);
            if (!headerEl || !bodyEl) return;

            // Header
            let headerHTML = '<th>Staff Member</th>';
            hours.forEach(hour => {
                headerHTML += `<th>${hour}:00</th>`;
            });
            headerHTML += '<th>Total</th>';
            headerEl.innerHTML = headerHTML;

            // Sort by total
            const sortedStaff = staffCodes.map(code => ({
                code,
                total: pickerTotals[code]
            })).sort((a, b) => b.total - a.total);

            // Body
            let bodyHTML = '';
            sortedStaff.forEach(staff => {
                bodyHTML += `<tr><td><strong>${staff.code}</strong></td>`;
                
                const pickerHours = hourlyData[staff.code] || {};
                hours.forEach(hour => {
                    const count = pickerHours[hour] || 0;
                    const cellClass = count >= 70 ? 'hourly-high' : count >= 50 ? 'hourly-medium' : 'hourly-low';
                    bodyHTML += `<td><span class="hourly-cell ${cellClass}">${count.toLocaleString()}</span></td>`;
                });
                
                bodyHTML += `<td><strong>${staff.total.toLocaleString()}</strong></td></tr>`;
            });
            bodyEl.innerHTML = bodyHTML;
        }

        function renderCharts() {
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not loaded yet');
                return;
            }

            const pickers = Object.keys(pickerTotals);
            const hours = getPersistentHours();

            const pickerStaff = pickers.filter(code => {
                const s = pickersDatabase.find(p => p.code === code);
                return s && s.designation === 'Picker';
            }).sort((a, b) => (pickerTotals[b] || 0) - (pickerTotals[a] || 0));

            const operatorStaff = pickers.filter(code => {
                const s = pickersDatabase.find(p => p.code === code);
                return s && s.designation === 'Operator';
            }).sort((a, b) => (pickerTotals[b] || 0) - (pickerTotals[a] || 0));

            // 1. Picker Total Chart
            renderBarChart('picker-total-chart', pickerStaff, 'Pickers Output', 825);
            
            // 2. Operator Total Chart
            renderBarChart('operator-total-chart', operatorStaff, 'Operators Output', 6300);

            // 3. Picker Trend Chart
            renderTrendChart('picker-trend-chart', pickerStaff, hours);

            // 4. Operator Trend Chart
            renderTrendChart('operator-trend-chart', operatorStaff, hours);
        }

        function renderBarChart(id, staffCodes, label, targetValue) {
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            const chartId = `chart_${id}`;
            if (window[chartId]) window[chartId].destroy();

            const targetLinePlugin = {
                id: 'targetLine',
                afterDraw: chart => {
                    const target = chart.config.options.plugins.targetLine?.value;
                    if (!target) return;
                    const ctx = chart.ctx;
                    const xAxis = chart.scales.x;
                    const yAxis = chart.scales.y;
                    
                    const xTargetPos = xAxis.getPixelForValue(target);
                    
                    // 1. Draw Target Line
                    if (xTargetPos >= xAxis.left && xTargetPos <= xAxis.right) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(xTargetPos, yAxis.top);
                        ctx.lineTo(xTargetPos, yAxis.bottom);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#ff4d4d'; // Brighter red
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();
                        
                        ctx.fillStyle = '#ff4d4d';
                        ctx.font = 'bold 11px sans-serif';
                        ctx.fillText(`🏁 Goal: ${target.toLocaleString()}`, xTargetPos - 30, yAxis.top - 5);
                        ctx.restore();
                    }

                    // 2. Draw Trophies for bars that crossed the target
                    ctx.save();
                    const meta = chart.getDatasetMeta(0);
                    meta.data.forEach((bar, index) => {
                        const value = chart.data.datasets[0].data[index];
                        if (value >= target) {
                            // Position trophy at the end of the bar
                            const xPos = bar.x;
                            const yPos = bar.y;
                            ctx.font = '16px serif';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillText('🏆', xPos + 8, yPos);
                        }
                    });
                    ctx.restore();
                }
            };

            window[chartId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: staffCodes,
                    datasets: [{
                        label: label,
                        data: staffCodes.map(code => pickerTotals[code]),
                        backgroundColor: staffCodes.map((_, i) => PICKER_COLORS[i % PICKER_COLORS.length]),
                        borderRadius: 6
                    }]
                },
                plugins: [targetLinePlugin],
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20 // Space for the flag label
                        }
                    },
                    plugins: { 
                        legend: { display: false },
                        targetLine: { value: targetValue }
                    },
                    scales: {
                        x: { 
                            beginAtZero: true, 
                            suggestedMax: targetValue * 1.1, // Ensure target is visible
                            grid: { color: 'rgba(255,255,255,0.05)' }, 
                            ticks: { color: '#a0aec0', font: { size: 10 } } 
                        },
                        y: { 
                            grid: { display: false }, 
                            ticks: { 
                                color: '#a0aec0', 
                                font: { size: 10 },
                                autoSkip: false // Ensure all staff names are visible
                            } 
                        }
                    }
                }
            });
        }

        function renderTrendChart(id, staffCodes, hours) {
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            const chartId = `chart_${id}`;
            if (window[chartId]) window[chartId].destroy();

            const datasets = staffCodes.map((code, index) => ({
                label: code,
                data: hours.map(hour => (hourlyData[code] && hourlyData[code][hour]) || 0),
                borderColor: PICKER_COLORS[index % PICKER_COLORS.length],
                backgroundColor: PICKER_COLORS[index % PICKER_COLORS.length],
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 2
            }));

            window[chartId] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: hours.map(h => `${h}:00`),
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: { color: '#a0aec0', padding: 8, font: { size: 9 } } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0aec0', font: { size: 10 } } },
                        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0aec0', font: { size: 10 } } }
                    }
                }
            });
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }

        async function promptSetGoal() {
            if (displayMode === 'QTY') {
                alert("Goal can only be set in VALUE mode.");
                return;
            }

            let body = {};
            if (displayMode === 'VALUE') {
                const effectiveGoalValue = dashboardConfig.dailyGoalValue > 0 ? dashboardConfig.dailyGoalValue : targetPlanTotalVal;
                const currentGoalM = effectiveGoalValue / 1000000;
                const promptMsg = `Enter Today's Target in Millions (e.g., 20 for 20M) or 0 to use dynamically calculated value:`;
                const result = prompt(promptMsg, currentGoalM.toFixed(2));
                if (result === null) return;
                const numVal = parseFloat(result);
                if (isNaN(numVal) || numVal < 0) {
                    alert("⚠️ Please enter a valid non-negative number.");
                    return;
                }
                body = { dailyGoalValue: numVal * 1000000 };
            }

            try {
                const res = await AuthGuard.authFetch(`${API_BASE_URL}/config`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                
                if (res.ok) {
                    const data = await res.json();
                    dashboardConfig = data.config;
                    updateDashboard();
                } else {
                    const errData = await res.json();
                    alert(`❌ Failed to update goal: ${errData.error || 'Server error'}`);
                }
            } catch (err) {
                console.error(err);
                alert("❌ Error saving goal: " + err.message);
            }
        }

        // --- Dashboard Layout Customization ---
        function getDashboardLayout() {
            const defaultLayout = [
                { id: 'section-goal', title: 'Daily Goal Progress', visible: true },
                { id: 'section-main-stats', title: 'Main Statistics', visible: true },
                { id: 'section-plan-status', title: 'Plan Status Breakdown', visible: true },
                { id: 'section-charts', title: 'Performance Charts', visible: true },
                { id: 'section-table-picker', title: 'Hourly Picks by Picker', visible: true },
                { id: 'section-table-operator', title: 'Hourly Picks by Operator', visible: true }
            ];
            const saved = localStorage.getItem('dashboard_layout');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const layout = [];
                    parsed.forEach(item => {
                        const def = defaultLayout.find(d => d.id === item.id);
                        if (def) layout.push({ ...def, visible: item.visible });
                    });
                    defaultLayout.forEach(def => {
                        if (!layout.find(l => l.id === def.id)) layout.push(def);
                    });
                    return layout;
                } catch(e) {
                    console.error("Error parsing dashboard layout", e);
                }
            }
            return defaultLayout;
        }

        function saveDashboardLayout(layout) {
            localStorage.setItem('dashboard_layout', JSON.stringify(layout));
            applyDashboardLayout();
            if (document.getElementById('customize-modal').style.display === 'flex') {
                renderCustomizeModal();
            }
        }

        function applyDashboardLayout() {
            const layout = getDashboardLayout();
            const container = document.getElementById('dashboard-sections-container');
            if (!container) return;

            layout.forEach((item, index) => {
                const el = document.getElementById(item.id);
                if (el) {
                    el.style.order = index;
                    if (!item.visible) {
                        el.style.display = 'none';
                    } else {
                        if (item.id === 'section-charts') {
                            el.style.display = 'grid';
                        } else if (item.id === 'section-goal') {
                            el.style.display = 'block';
                        } else {
                            el.style.display = ''; 
                        }
                    }
                }
            });
        }

        function openCustomizeModal() {
            document.getElementById('customize-modal').style.display = 'flex';
            renderCustomizeModal();
        }

        function closeCustomizeModal() {
            document.getElementById('customize-modal').style.display = 'none';
        }

        function renderCustomizeModal() {
            const layout = getDashboardLayout();
            const list = document.getElementById('customize-sections-list');
            list.innerHTML = '';
            
            layout.forEach((item, index) => {
                const row = document.createElement('div');
                row.style = `display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);`;
                
                const leftDiv = document.createElement('div');
                leftDiv.style.display = 'flex';
                leftDiv.style.alignItems = 'center';
                leftDiv.style.gap = '12px';

                const orderControls = document.createElement('div');
                orderControls.style.display = 'flex';
                orderControls.style.flexDirection = 'column';
                
                const upBtn = document.createElement('button');
                upBtn.innerHTML = '▲';
                upBtn.style = `background:none; border:none; color: ${index === 0 ? 'rgba(255,255,255,0.2)' : 'white'}; cursor: ${index === 0 ? 'default' : 'pointer'}; font-size: 10px; padding: 2px;`;
                upBtn.onclick = () => {
                    if (index > 0) {
                        const newLayout = [...layout];
                        [newLayout[index - 1], newLayout[index]] = [newLayout[index], newLayout[index - 1]];
                        saveDashboardLayout(newLayout);
                    }
                };

                const downBtn = document.createElement('button');
                downBtn.innerHTML = '▼';
                downBtn.style = `background:none; border:none; color: ${index === layout.length - 1 ? 'rgba(255,255,255,0.2)' : 'white'}; cursor: ${index === layout.length - 1 ? 'default' : 'pointer'}; font-size: 10px; padding: 2px;`;
                downBtn.onclick = () => {
                    if (index < layout.length - 1) {
                        const newLayout = [...layout];
                        [newLayout[index + 1], newLayout[index]] = [newLayout[index], newLayout[index + 1]];
                        saveDashboardLayout(newLayout);
                    }
                };

                orderControls.appendChild(upBtn);
                orderControls.appendChild(downBtn);

                const titleSpan = document.createElement('span');
                titleSpan.textContent = item.title;
                titleSpan.style.color = 'white';
                titleSpan.style.fontWeight = '500';

                leftDiv.appendChild(orderControls);
                leftDiv.appendChild(titleSpan);

                const rightDiv = document.createElement('div');
                const toggleBtn = document.createElement('button');
                toggleBtn.textContent = item.visible ? 'Visible' : 'Hidden';
                toggleBtn.style = `padding: 4px 10px; border-radius: 12px; border: none; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;`;
                if (item.visible) {
                    toggleBtn.style.background = 'var(--accent-green)';
                    toggleBtn.style.color = '#000';
                } else {
                    toggleBtn.style.background = 'rgba(255,255,255,0.1)';
                    toggleBtn.style.color = 'var(--text-secondary)';
                }
                toggleBtn.onclick = () => {
                    const newLayout = [...layout];
                    newLayout[index].visible = !newLayout[index].visible;
                    saveDashboardLayout(newLayout);
                };
                
                rightDiv.appendChild(toggleBtn);
                row.appendChild(leftDiv);
                row.appendChild(rightDiv);
                list.appendChild(row);
            });
        }

        // Apply layout synchronously on load
        applyDashboardLayout();

        // Initialize and auto-refresh
        (async () => {
            const user = await AuthGuard.init();
            window.currentUser = user;
            if (!user) return;
            
            if (user.role === 'visitor' || user.role === 'viewer') {
                const chartsContainer = document.getElementById('section-charts');
                if (chartsContainer) chartsContainer.style.display = 'none';
                
                // Hide all chart cards (including hourly picks)
                document.querySelectorAll('.chart-card').forEach(card => {
                    card.style.display = 'none';
                });

                // Hide tabs if we only want visitors to see the main view
                const tabsHeader = document.querySelector('.tabs-header');
                if (tabsHeader) tabsHeader.style.display = 'none';

                // Hide customize button
                const customizeBtn = document.querySelector('button[onclick="openCustomizeModal()"]');
                if (customizeBtn) customizeBtn.style.display = 'none';
            }

            // Show set-goal button for admin and client
            const editBtn = document.getElementById('edit-goal-btn');
            if (editBtn) {
                editBtn.style.display = (user.role === 'admin' || user.role === 'client') ? 
                    (displayMode === 'VALUE' ? 'inline-block' : 'none') : 'none';
            }

            loadDashboardData();
            setInterval(() => {
                        if (document.hidden) return; loadDashboardData(); }, 60000); // Refresh every minute
        })();
    