<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Редактор отсеков - ДВФУ</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background-color: #F9FAFB; /* Light gray background */
            color: #111827; /* Dark text for readability */
        }
        
        /* Custom scrollbar for inner areas - Light Theme */
        ::-webkit-scrollbar {
            width: 6px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: #D1D5DB;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #9CA3AF;
        }

        /* Highlight color from the image */
        .theme-accent {
            background-color: #F05123;
        }
        .theme-accent-text {
            color: #F05123;
        }
        .theme-accent-border {
            border-color: #F05123;
        }
        
        .panel-bg {
            background-color: #FFFFFF;
        }

        .item-hover:hover {
            background-color: #F3F4F6;
        }
        
        .selected-item {
            background-color: #FFF7ED; /* Very light orange */
        }

        /* Map styling for light theme */
        .map-polygon {
            fill: #F3F4F6;
            stroke: #D1D5DB;
            stroke-width: 2;
            transition: fill 0.2s ease, opacity 0.2s ease;
            cursor: pointer;
        }
        .map-polygon:hover {
            fill: #E5E7EB;
        }
        .map-polygon.active {
            fill: #F05123;
            opacity: 0.9;
        }
        .map-text {
            fill: #6B7280;
            font-size: 16px;
            font-weight: bold;
            pointer-events: none;
            transition: fill 0.2s ease;
        }
        .map-polygon.active + .map-text {
            fill: white;
        }
        
        /* Utility for sharp corners (no rounding) */
        .sharp {
            border-radius: 0 !important;
        }
    </style>
</head>
<body class="h-screen w-screen overflow-hidden flex flex-col text-sm">

    <!-- Header -->
    <header class="flex items-center px-4 py-3 border-b border-gray-200 panel-bg shrink-0 shadow-sm z-10 relative">
        <button class="text-gray-500 hover:text-gray-900 mr-2 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
        </button>
        <div class="flex items-center space-x-2 text-sm font-medium">
            <span class="text-gray-900">ДВФУ</span>
            <span class="text-gray-400">&gt;</span>
            <span class="text-gray-600">Редактор отсеков</span>
        </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 flex overflow-hidden">
        
        <!-- Left Column: List -->
        <aside class="w-64 border-r border-gray-200 flex flex-col panel-bg shrink-0 z-0">
            <div class="p-4 pb-2 border-b border-gray-100">
                <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Отсеки на схеме</h2>
            </div>
            
            <div class="flex-1 overflow-y-auto py-2" id="compartment-list">
                <!-- Item 1 (Selected) -->
                <div class="px-4 py-2 cursor-pointer transition-colors selected-item border-l-2 theme-accent-border flex items-start" onclick="selectCompartment(this, 1)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 theme-accent text-xs">1</div>
                    <div>
                        <div class="font-medium text-gray-900">Отсек 1</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>

                <!-- Item 2 -->
                <div class="px-4 py-2 cursor-pointer transition-colors item-hover border-l-2 border-transparent flex items-start" onclick="selectCompartment(this, 2)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 bg-emerald-600 text-xs">2</div>
                    <div>
                        <div class="font-medium text-gray-800">Отсек 2</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>

                <!-- Item 3 -->
                <div class="px-4 py-2 cursor-pointer transition-colors item-hover border-l-2 border-transparent flex items-start" onclick="selectCompartment(this, 3)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 bg-purple-600 text-xs">3</div>
                    <div>
                        <div class="font-medium text-gray-800">Отсек 3</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>

                <!-- Item 4 -->
                <div class="px-4 py-2 cursor-pointer transition-colors item-hover border-l-2 border-transparent flex items-start" onclick="selectCompartment(this, 4)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 bg-slate-500 text-xs">4</div>
                    <div>
                        <div class="font-medium text-gray-800">Отсек 4</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>

                <!-- Item 5 -->
                <div class="px-4 py-2 cursor-pointer transition-colors item-hover border-l-2 border-transparent flex items-start" onclick="selectCompartment(this, 5)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 bg-indigo-600 text-xs">5</div>
                    <div>
                        <div class="font-medium text-gray-800">Отсек 5</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>

                <!-- Item 6 -->
                <div class="px-4 py-2 cursor-pointer transition-colors item-hover border-l-2 border-transparent flex items-start" onclick="selectCompartment(this, 6)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 bg-fuchsia-600 text-xs">6</div>
                    <div>
                        <div class="font-medium text-gray-800">Отсек 6</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>
                
                <!-- Item 7 -->
                <div class="px-4 py-2 cursor-pointer transition-colors item-hover border-l-2 border-transparent flex items-start" onclick="selectCompartment(this, 7)">
                    <div class="w-6 h-6 sharp flex items-center justify-center text-white font-bold mr-3 bg-pink-600 text-xs">7</div>
                    <div>
                        <div class="font-medium text-gray-800">Отсек 7</div>
                        <div class="text-xs text-gray-500">Корпус 24 А</div>
                    </div>
                </div>
            </div>
        </aside>

        <!-- Middle Column: Grid -->
        <section class="flex-1 flex flex-col border-r border-gray-200 bg-gray-50 max-w-3xl min-w-[350px]">
            <div class="p-4 border-b border-gray-200 bg-white shadow-sm z-10">
                <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Планы этого этажа</h2>
                
                <!-- Filters Row -->
                <div class="flex flex-wrap gap-2 items-center">
                    <!-- Search Input -->
                    <div class="relative flex-grow min-w-[150px]">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input type="text" class="block w-full pl-10 pr-3 py-1.5 border border-gray-300 sharp leading-5 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm transition-colors" placeholder="Поиск...">
                    </div>
                    
                    <!-- Building Filter -->
                    <div class="relative flex-grow sm:flex-grow-0 sm:w-48 min-w-[140px]">
                        <select id="building-select" class="block w-full pl-3 pr-10 py-1.5 border border-gray-300 sharp leading-5 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm appearance-none transition-colors cursor-pointer" onchange="handleBuildingChange()">
                            <option value="">Все здания</option>
                            <option value="b24">Корпус 24 А</option>
                            <option value="b25">Корпус 25</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    <!-- Floor Filter -->
                    <div class="relative flex-grow sm:flex-grow-0 sm:w-40 min-w-[120px]">
                        <select id="floor-select" disabled class="block w-full pl-3 pr-10 py-1.5 border border-gray-300 sharp leading-5 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm appearance-none transition-colors cursor-pointer disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed">
                            <option value="">Все этажи</option>
                            <option value="1">Этаж 1</option>
                            <option value="11">Этаж 11</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Grid Items -->
            <div class="flex-1 overflow-y-auto p-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="plan-grid">
                    
                    <!-- Grid Item 1 -->
                    <div class="bg-white border border-gray-200 sharp overflow-hidden cursor-pointer hover:border-gray-400 shadow-sm transition-all group" onclick="selectPlan(this)">
                        <div class="h-28 bg-gray-100 relative border-b border-gray-100">
                            <img src="https://placehold.co/300x150/F3F4F6/9CA3AF?text=Plan+A11.5" alt="Plan" class="w-full h-full object-cover group-hover:opacity-90 transition-opacity">
                        </div>
                        <div class="p-3">
                            <h3 class="text-sm font-medium text-gray-900 mb-1">A11.5 — Этаж 11</h3>
                            <p class="text-xs text-gray-500">Отсек 5</p>
                        </div>
                    </div>

                    <!-- Grid Item 2 (Selected) -->
                    <div class="bg-white border-2 border-[#F05123] sharp overflow-hidden cursor-pointer relative shadow-md transition-all group" onclick="selectPlan(this)">
                        <!-- Checkmark Badge -->
                        <div class="absolute top-2 right-2 w-6 h-6 sharp theme-accent flex items-center justify-center z-10 shadow-sm">
                            <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div class="h-28 bg-gray-100 relative border-b border-[#F05123]/20">
                            <img src="https://placehold.co/300x150/F3F4F6/9CA3AF?text=Plan+A11.4" alt="Plan" class="w-full h-full object-cover">
                            <!-- Overlay tint -->
                            <div class="absolute inset-0 bg-[#F05123] opacity-10"></div>
                        </div>
                        <div class="p-3">
                            <h3 class="text-sm font-medium text-gray-900 mb-1">A11.4 — Этаж 11</h3>
                            <p class="text-xs text-gray-500">Отсек 4</p>
                        </div>
                    </div>

                    <!-- Grid Item 3 -->
                    <div class="bg-white border border-gray-200 sharp overflow-hidden cursor-pointer hover:border-gray-400 shadow-sm transition-all group" onclick="selectPlan(this)">
                        <div class="h-28 bg-gray-100 relative border-b border-gray-100">
                            <img src="https://placehold.co/300x150/F3F4F6/9CA3AF?text=Plan+A11.3" alt="Plan" class="w-full h-full object-cover group-hover:opacity-90 transition-opacity">
                        </div>
                        <div class="p-3">
                            <h3 class="text-sm font-medium text-gray-900 mb-1">A11.3 — Этаж 11</h3>
                            <p class="text-xs text-gray-500">Отсек 3</p>
                        </div>
                    </div>
                    
                    <!-- Grid Item 4 -->
                    <div class="bg-white border border-gray-200 sharp overflow-hidden cursor-pointer hover:border-gray-400 shadow-sm transition-all group" onclick="selectPlan(this)">
                        <div class="h-28 bg-gray-100 relative border-b border-gray-100">
                            <img src="https://placehold.co/300x150/F3F4F6/9CA3AF?text=Plan+A11.2" alt="Plan" class="w-full h-full object-cover group-hover:opacity-90 transition-opacity">
                        </div>
                        <div class="p-3">
                            <h3 class="text-sm font-medium text-gray-900 mb-1">A11.2 — Этаж 11</h3>
                            <p class="text-xs text-gray-500">Отсек 2</p>
                        </div>
                    </div>

                    <!-- Grid Item 5 -->
                    <div class="bg-white border border-gray-200 sharp overflow-hidden cursor-pointer hover:border-gray-400 shadow-sm transition-all group" onclick="selectPlan(this)">
                        <div class="h-28 bg-gray-100 relative border-b border-gray-100">
                            <img src="https://placehold.co/300x150/F3F4F6/9CA3AF?text=Plan+A11.1" alt="Plan" class="w-full h-full object-cover group-hover:opacity-90 transition-opacity">
                        </div>
                        <div class="p-3">
                            <h3 class="text-sm font-medium text-gray-900 mb-1">A11.1 — Этаж 11</h3>
                            <p class="text-xs text-gray-500">Отсек 1</p>
                        </div>
                    </div>

                </div>
            </div>
        </section>

        <!-- Right Column: Viewport / Editor -->
        <section class="flex-1 bg-[#E5E7EB] relative flex items-center justify-center overflow-hidden" id="map-container" style="background-image: radial-gradient(#D1D5DB 1px, transparent 1px); background-size: 20px 20px;">
            
            <!-- Map Canvas Container -->
            <div class="bg-white w-[85%] h-[85%] max-w-[800px] flex items-center justify-center relative shadow-xl border border-gray-200 transition-transform duration-300" id="map-canvas">
                
                <!-- SVG Drawing: Simple clean abstract floor plan -->
                <svg viewBox="0 0 800 600" class="w-full h-full p-6">
                    <!-- Base Corridor Outline -->
                    <rect x="80" y="260" width="640" height="80" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="2" />
                    
                    <!-- Top Row Compartments -->
                    <!-- Compartment 1 -->
                    <g onclick="selectCompartmentById(1)">
                        <rect x="100" y="100" width="140" height="160" class="map-polygon active" id="poly-1" />
                        <text x="170" y="185" text-anchor="middle" class="map-text">1</text>
                    </g>
                    <!-- Compartment 2 -->
                    <g onclick="selectCompartmentById(2)">
                        <rect x="260" y="100" width="140" height="160" class="map-polygon" id="poly-2" />
                        <text x="330" y="185" text-anchor="middle" class="map-text">2</text>
                    </g>
                    <!-- Compartment 3 -->
                    <g onclick="selectCompartmentById(3)">
                        <rect x="420" y="100" width="140" height="160" class="map-polygon" id="poly-3" />
                        <text x="490" y="185" text-anchor="middle" class="map-text">3</text>
                    </g>
                    <!-- Compartment 4 -->
                    <g onclick="selectCompartmentById(4)">
                        <rect x="580" y="140" width="120" height="120" class="map-polygon" id="poly-4" />
                        <text x="640" y="205" text-anchor="middle" class="map-text">4</text>
                    </g>

                    <!-- Bottom Row Compartments -->
                    <!-- Compartment 5 -->
                    <g onclick="selectCompartmentById(5)">
                        <rect x="150" y="340" width="140" height="160" class="map-polygon" id="poly-5" />
                        <text x="220" y="425" text-anchor="middle" class="map-text">5</text>
                    </g>
                    <!-- Compartment 6 -->
                    <g onclick="selectCompartmentById(6)">
                        <rect x="310" y="340" width="160" height="160" class="map-polygon" id="poly-6" />
                        <text x="390" y="425" text-anchor="middle" class="map-text">6</text>
                    </g>
                    <!-- Compartment 7 -->
                    <g onclick="selectCompartmentById(7)">
                        <rect x="490" y="340" width="140" height="160" class="map-polygon" id="poly-7" />
                        <text x="560" y="425" text-anchor="middle" class="map-text">7</text>
                    </g>
                </svg>

            </div>

        </section>
    </main>

    <!-- Footer / Action Bar -->
    <footer class="flex items-center justify-between px-6 py-3 border-t border-gray-200 panel-bg shrink-0 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10 relative">
        <button class="px-5 py-2 border border-gray-300 text-gray-700 bg-white sharp hover:bg-gray-50 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Назад
        </button>
        
        <div class="flex gap-3">
            <button class="px-5 py-2 border border-gray-300 text-gray-700 bg-white sharp hover:bg-gray-50 hover:text-gray-900 transition-colors text-sm font-medium">
                Сохранить и выйти
            </button>
            <button class="px-8 py-2 theme-accent text-white sharp hover:bg-orange-600 transition-colors shadow-sm font-medium text-sm">
                Сохранить
            </button>
        </div>
    </footer>

    <script>
        // --- Filter Logic ---
        function handleBuildingChange() {
            const buildingSelect = document.getElementById('building-select');
            const floorSelect = document.getElementById('floor-select');
            
            if (buildingSelect.value !== "") {
                floorSelect.disabled = false;
            } else {
                floorSelect.disabled = true;
                floorSelect.value = ""; // Reset floor selection
            }
        }

        // --- Left Panel & Map Interaction ---
        function selectCompartment(element, id) {
            // Update List UI
            const items = document.querySelectorAll('#compartment-list > div');
            items.forEach(item => {
                item.classList.remove('selected-item', 'border-l-2', 'theme-accent-border');
                item.classList.add('item-hover', 'border-transparent');
            });

            element.classList.remove('item-hover', 'border-transparent');
            element.classList.add('selected-item', 'border-l-2', 'theme-accent-border');

            // Update Map UI
            updateMapSelection(id);
        }

        function selectCompartmentById(id) {
            const listItems = document.querySelectorAll('#compartment-list > div');
            if (id - 1 < listItems.length) {
                const targetElement = listItems[id - 1];
                selectCompartment(targetElement, id);
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        function updateMapSelection(id) {
            const mapPolygons = document.querySelectorAll('.map-polygon');
            mapPolygons.forEach(p => p.classList.remove('active'));
            
            const targetPolygon = document.getElementById(`poly-${id}`);
            if (targetPolygon) {
                targetPolygon.classList.add('active');
            }
        }

        // --- Middle Panel Interaction ---
        function selectPlan(element) {
             const plans = document.querySelectorAll('#plan-grid > div');
             plans.forEach(plan => {
                 // Remove active classes
                 plan.classList.remove('border-2', 'border-[#F05123]', 'shadow-md');
                 plan.classList.add('border', 'border-gray-200', 'hover:border-gray-400', 'shadow-sm');
                 
                 const badge = plan.querySelector('.absolute.top-2');
                 if(badge) badge.remove();
                 
                 const imgContainer = plan.querySelector('.h-28');
                 imgContainer.classList.remove('border-[#F05123]/20');
                 imgContainer.classList.add('border-gray-100');
                 
                 const overlay = imgContainer.querySelector('.opacity-10');
                 if(overlay) overlay.remove();
             });

             // Add active classes to clicked
             element.classList.remove('border', 'border-gray-200', 'hover:border-gray-400', 'shadow-sm');
             element.classList.add('border-2', 'border-[#F05123]', 'shadow-md');

             const badgeHTML = `
                <div class="absolute top-2 right-2 w-6 h-6 sharp theme-accent flex items-center justify-center z-10 shadow-sm">
                    <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
             `;
             element.insertAdjacentHTML('afterbegin', badgeHTML);

             const imgContainer = element.querySelector('.h-28');
             imgContainer.classList.remove('border-gray-100');
             imgContainer.classList.add('border-[#F05123]/20');
             
             const overlayHTML = `<div class="absolute inset-0 bg-[#F05123] opacity-10 pointer-events-none"></div>`;
             imgContainer.insertAdjacentHTML('beforeend', overlayHTML);
        }

        // Map Drag to Pan (Visual only for prototype)
        const mapContainer = document.getElementById('map-container');
        let isDragging = false;
        let startX, startY;

        mapContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            mapContainer.classList.add('cursor-grabbing');
        });

        mapContainer.addEventListener('mouseleave', () => {
            isDragging = false;
            mapContainer.classList.remove('cursor-grabbing');
        });

        mapContainer.addEventListener('mouseup', () => {
            isDragging = false;
            mapContainer.classList.remove('cursor-grabbing');
        });

    </script>
</body>
</html>