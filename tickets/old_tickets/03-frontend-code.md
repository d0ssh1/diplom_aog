import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, CloudUpload, X, Crop, Wand2, Edit2, 
    Scissors, ArrowLeft, Image as ImageIcon, Layout,
    LogOut, Trash2, Eraser, PenLine, Scan,
    MapPin, Layers, Plus, Minus, Compass, Info,
    Save, Tag, Database, CheckSquare
} from 'lucide-react';

// --- НАСТРОЙКИ СТИЛЯ ---
const THEME = {
    orange: '#FF4500', // Ярко-оранжевый из референсов
    black: '#0A0A0A',
    gray: '#E5E5E5',
    darkGray: '#1A1A1A'
};

// ==========================================
// КОМПОНЕНТ: Анимированный фон (Частицы/Зрение)
// ==========================================
const ParticleBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resize);
        resize();

        // Создаем частицы
        for (let i = 0; i < 70; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 1,
                vy: (Math.random() - 0.5) * 1,
                size: Math.random() * 2 + 1
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = THEME.orange;
            ctx.strokeStyle = THEME.orange;

            // Обновляем и рисуем частицы
            particles.forEach((p, index) => {
                p.x += p.vx;
                p.y += p.vy;

                // Отскок от краев
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                // Соединяем линиями близкие частицы (эффект нейросети/зрения)
                for (let j = index + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(255, 69, 0, ${1 - dist / 120})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                        
                        // Случайные "квадраты обнаружения" как на референсе с человеком
                        if (Math.random() > 0.995) {
                            ctx.strokeRect(p.x - 10, p.y - 10, 20, 20);
                        }
                    }
                }
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full pointer-events-none opacity-40 mix-blend-multiply"
        />
    );
};

// ==========================================
// ГЛОБАЛЬНЫЕ КОМПОНЕНТЫ
// ==========================================
const TopBar = ({ title, rightText, onRightClick, isDark = false }) => (
    <div className="flex h-14 w-full">
        <div className={`flex-1 flex items-center px-6 font-mono text-sm font-bold tracking-wider ${isDark ? 'bg-[#FF4500] text-black' : 'bg-[#FF4500] text-black'}`}>
            {title}
        </div>
        <button 
            onClick={onRightClick}
            className={`px-8 flex items-center justify-center font-mono text-xs transition-colors ${isDark ? 'bg-black text-white hover:bg-gray-900' : 'bg-black text-white hover:bg-gray-900'}`}
        >
            {rightText}
        </button>
    </div>
);

// ==========================================
// ЭКРАН 1: Главная (Поиск)
// ==========================================
const HomeView = ({ navigate }) => {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    return (
        <div className="min-h-screen bg-white relative overflow-hidden flex flex-col">
            <TopBar title="SUPER_DIPLOM" rightText="Войти как администратор" onRightClick={() => navigate('login')} />
            
            {/* Анимированный фон */}
            <ParticleBackground />

            <div className="flex-1 flex flex-col items-center justify-center z-10 relative px-4">
                <h1 className="text-4xl md:text-5xl font-medium mb-12 tracking-tight text-black">
                    Введите название или код
                </h1>
                
                <div className="w-full max-w-2xl relative group">
                    <input 
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                        className="w-full h-16 border-2 border-black bg-white/80 backdrop-blur-sm text-xl px-6 outline-none transition-all focus:border-[#FF4500] focus:shadow-[4px_4px_0px_0px_rgba(255,69,0,1)] relative z-20"
                        placeholder="// search_query"
                    />
                    <button className="absolute right-0 top-0 h-16 w-16 flex items-center justify-center bg-transparent border-l-2 border-black group-focus-within:border-[#FF4500] group-focus-within:text-[#FF4500] transition-colors z-20">
                        <Search size={28} />
                    </button>

                    {/* Выпадающее меню с результатами */}
                    {isFocused && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-30">
                            <div 
                                className="p-5 hover:bg-[#FF4500] hover:text-white cursor-pointer transition-colors font-mono flex items-center group/item"
                                onClick={() => navigate('map')}
                            >
                                <MapPin size={20} className="mr-4 text-[#FF4500] group-hover/item:text-white" />
                                <div className="flex-1">
                                    <div className="font-bold text-lg font-sans">ДВФУ</div>
                                    <div className="text-xs opacity-70">Кампус на о. Русский, 3D Модель</div>
                                </div>
                                <div className="text-xs border border-current px-2 py-1 uppercase tracking-widest bg-white text-black group-hover/item:bg-black group-hover/item:text-white transition-colors">Просмотр</div>
                            </div>
                            <div className="p-5 hover:bg-gray-100 cursor-pointer transition-colors font-mono flex items-center text-gray-400">
                                <MapPin size={20} className="mr-4" />
                                <div className="flex-1">
                                    <div className="font-bold text-lg font-sans">ВГУЭС</div>
                                    <div className="text-xs">Главный корпус (Данные отсутствуют)</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Декоративные технические элементы */}
                <div className="absolute bottom-10 left-10 font-mono text-xs text-gray-400">
                    <p>SYS.STATUS // ONLINE</p>
                    <p>DB.CONNECTION // ESTABLISHED</p>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ЭКРАН 1.5: Пользовательская 3D Карта (ДВФУ)
// ==========================================
const MapUserView = ({ navigate }) => {
    const mountRef = useRef(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let animationFrameId;
        let rendererInstance;

        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
            });
        };

        const initScene = async () => {
            try {
                // Динамическая загрузка Three.js, если его нет
                if (!window.THREE) {
                    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
                }
                if (!window.THREE.OrbitControls) {
                    await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
                }

                setLoading(false);

                if (!mountRef.current) return;

                const width = mountRef.current.clientWidth;
                const height = mountRef.current.clientHeight;

                // Сцена и Камера
                const scene = new window.THREE.Scene();
                scene.background = new window.THREE.Color('#E5E5E5');

                const camera = new window.THREE.PerspectiveCamera(40, width / height, 1, 1000);
                camera.position.set(70, 70, 70);

                // Рендерер
                const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: false });
                renderer.setSize(width, height);
                renderer.setPixelRatio(window.devicePixelRatio);
                mountRef.current.innerHTML = '';
                mountRef.current.appendChild(renderer.domElement);
                rendererInstance = renderer;

                // Контроллеры (вращение/зум)
                const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;
                controls.maxPolarAngle = Math.PI / 2 - 0.05; // Чтобы не заглядывать под землю
                controls.minDistance = 20;
                controls.maxDistance = 200;

                // Освещение
                const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.7);
                scene.add(ambientLight);
                
                const dirLight = new window.THREE.DirectionalLight(0xffffff, 0.6);
                dirLight.position.set(50, 100, 30);
                scene.add(dirLight);

                // Сетка (Стиль чертежа)
                const gridHelper = new window.THREE.GridHelper(200, 50, '#FF4500', '#000000');
                gridHelper.material.opacity = 0.15;
                gridHelper.material.transparent = true;
                scene.add(gridHelper);

                // Земля
                const groundGeo = new window.THREE.PlaneGeometry(200, 200);
                const groundMat = new window.THREE.MeshBasicMaterial({ color: '#EAEAEA', depthWrite: false });
                const ground = new window.THREE.Mesh(groundGeo, groundMat);
                ground.rotation.x = -Math.PI / 2;
                scene.add(ground);

                // --- Материалы зданий ---
                const buildMat = new window.THREE.MeshStandardMaterial({ color: '#2A2A2A', roughness: 0.8 });
                const highlightMat = new window.THREE.MeshStandardMaterial({ color: '#FF4500', roughness: 0.3 });

                // Функция добавления жестких контуров (Brutalism style)
                const addEdges = (mesh) => {
                    const edges = new window.THREE.EdgesGeometry(mesh.geometry);
                    const line = new window.THREE.LineSegments(edges, new window.THREE.LineBasicMaterial({ color: '#ffffff', linewidth: 1 }));
                    mesh.add(line);
                };

                // Главный корпус
                const mainB = new window.THREE.Mesh(new window.THREE.BoxGeometry(15, 12, 35), highlightMat);
                mainB.position.set(0, 6, 0);
                scene.add(mainB);
                addEdges(mainB);

                // Вспомогательные корпуса (имитация кампуса)
                const positions = [
                    [-25, 6, -15], [-25, 6, 0], [-25, 6, 15],
                    [20, 4, -20], [20, 4, 20],
                    [0, 3, -35], [0, 3, 35]
                ];

                positions.forEach(pos => {
                    const width = 8 + Math.random() * 4;
                    const depth = 8 + Math.random() * 4;
                    const b = new window.THREE.Mesh(new window.THREE.BoxGeometry(width, pos[1] * 2, depth), buildMat);
                    b.position.set(pos[0], pos[1], pos[2]);
                    scene.add(b);
                    addEdges(b);
                });

                // Дорожки
                const pathGeo = new window.THREE.PlaneGeometry(8, 80);
                const pathMat = new window.THREE.MeshBasicMaterial({ color: '#D0D0D0' });
                const path = new window.THREE.Mesh(pathGeo, pathMat);
                path.rotation.x = -Math.PI / 2;
                path.position.set(-10, 0.1, 0);
                scene.add(path);

                // Анимация
                const animate = () => {
                    animationFrameId = requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                };
                animate();

                // Обработка ресайза
                const handleResize = () => {
                    if(!mountRef.current) return;
                    const w = mountRef.current.clientWidth;
                    const h = mountRef.current.clientHeight;
                    renderer.setSize(w, h);
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                };
                window.addEventListener('resize', handleResize);

            } catch (err) {
                console.error("Failed to load 3D engine", err);
            }
        };

        initScene();

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (rendererInstance) rendererInstance.dispose();
            window.removeEventListener('resize', () => {});
        };
    }, []);

    return (
        <div className="relative w-full h-screen bg-[#E5E5E5] overflow-hidden">
            {/* 3D Canvas Контейнер */}
            <div ref={mountRef} className="absolute inset-0 cursor-move" />

            {/* Состояние загрузки */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#E5E5E5] z-50">
                    <div className="font-mono text-[#FF4500] text-xl animate-pulse font-bold tracking-widest uppercase">
                        Загрузка 3D ядра...
                    </div>
                </div>
            )}

            {/* UI Overlay: Левая Инфо-панель */}
            <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none z-10 w-80">
                {/* Хедер / Поиск */}
                <div className="bg-white border-2 border-black p-2 flex items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] pointer-events-auto">
                    <button onClick={() => navigate('home')} className="p-2 hover:bg-[#FF4500] hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="mx-3 w-px h-6 bg-gray-300"></div>
                    <span className="font-bold font-mono truncate">ДВФУ (Кампус)</span>
                </div>

                {/* Карточка объекта */}
                {!loading && (
                    <div className="bg-white border-2 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] pointer-events-auto animate-fade-in">
                        <h2 className="text-xl font-bold mb-2 uppercase">Главный корпус</h2>
                        <div className="text-xs font-mono text-gray-500 mb-4">г. Владивосток, п. Аякс, 10</div>
                        
                        <div className="space-y-3 text-sm border-t border-dashed border-gray-300 pt-4 font-mono">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Статус</span>
                                <span className="text-[#FF4500] font-bold">Открыто</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Аудитории</span>
                                <span>A, B, C, D</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Уровни</span>
                                <span>12 этажей</span>
                            </div>
                        </div>
                        
                        <button className="w-full mt-6 bg-black text-white py-3 font-mono text-xs uppercase tracking-widest hover:bg-[#FF4500] transition-colors shadow-[4px_4px_0px_0px_rgba(255,69,0,0.5)]">
                            Построить маршрут
                        </button>
                    </div>
                )}
            </div>

            {/* UI Overlay: Правые Контролы (Зум, Слои) */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-none z-10">
                <button className="w-12 h-12 bg-white border-2 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#FF4500] hover:text-white transition-colors pointer-events-auto group">
                    <Compass size={24} className="group-hover:rotate-45 transition-transform" />
                </button>
                <div className="h-4"></div>
                <button className="w-12 h-12 bg-white border-2 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#FF4500] hover:text-white transition-colors pointer-events-auto">
                    <Plus size={24} />
                </button>
                <button className="w-12 h-12 bg-white border-2 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#FF4500] hover:text-white transition-colors pointer-events-auto">
                    <Minus size={24} />
                </button>
                <div className="h-4"></div>
                <button className="w-12 h-12 bg-white border-2 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#FF4500] hover:text-white transition-colors pointer-events-auto">
                    <Layers size={24} />
                </button>
            </div>

            {/* Нижний водяной знак */}
            <div className="absolute bottom-6 right-6 font-mono text-xs font-bold pointer-events-none z-10 text-black/30">
                SYS.MAP // V 1.0.4
            </div>
        </div>
    );
};

// ==========================================
// ЭКРАН 2: Вход администратора
// ==========================================
const LoginView = ({ navigate }) => (
    <div className="min-h-screen flex bg-white">
        {/* Левая часть: Графика/Паттерн */}
        <div className="hidden md:flex flex-1 bg-[#FF4500] relative overflow-hidden items-center justify-center">
            {/* Имитация чертежа (blueprint) с помощью CSS сетки */}
            <div className="absolute inset-0" 
                 style={{ 
                     backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', 
                     backgroundSize: '20px 20px',
                     opacity: 0.3
                 }}>
            </div>
            
            <div className="relative z-10 text-black border-4 border-black p-12 backdrop-blur-md bg-[#FF4500]/50 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                <Layout size={120} strokeWidth={1} />
                <p className="font-mono text-sm mt-4 uppercase tracking-widest text-center">Auth_Module</p>
            </div>
            
            {/* Технические линии */}
            <div className="absolute top-0 left-20 w-px h-full bg-black/20 border-l border-dashed border-black"></div>
            <div className="absolute top-1/2 left-0 w-full h-px bg-black/20 border-t border-dashed border-black"></div>
        </div>

        {/* Правая часть: Форма */}
        <div className="flex-1 flex flex-col items-center justify-center px-12 relative">
            <button onClick={() => navigate('home')} className="absolute top-8 left-8 text-gray-400 hover:text-black transition-colors">
                <ArrowLeft size={24} />
            </button>
            
            <div className="w-full max-w-md">
                <h2 className="text-4xl font-bold mb-12 tracking-tight">Вход в систему</h2>
                
                <div className="space-y-8">
                    <input 
                        type="text" 
                        placeholder="Логин" 
                        className="w-full py-3 bg-transparent border-b border-dashed border-gray-400 outline-none focus:border-black transition-colors text-lg"
                    />
                    <input 
                        type="password" 
                        placeholder="Пароль" 
                        className="w-full py-3 bg-transparent border-b border-dashed border-gray-400 outline-none focus:border-black transition-colors text-lg"
                    />
                    
                    <button 
                        onClick={() => navigate('dashboard')}
                        className="w-full bg-black text-white h-14 font-medium text-lg mt-8 hover:bg-[#FF4500] transition-colors shadow-[4px_4px_0px_0px_rgba(229,229,229,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    >
                        Войти
                    </button>
                </div>
            </div>
        </div>
    </div>
);

// ==========================================
// ЭКРАН 3: Главное меню (Пусто / Файлы)
// ==========================================
const DashboardView = ({ navigate }) => {
    const [hasFiles, setHasFiles] = useState(false);

    return (
        <div className="min-h-screen flex flex-col bg-[#F0F0F0]">
            <TopBar title="PROJECT_DIPLOM" rightText="Ник_админа" onRightClick={() => navigate('home')} isDark={true} />
            
            <div className="flex flex-1 h-[calc(100vh-56px)]">
                {/* Левое меню */}
                <div className="w-72 bg-white flex flex-col border-r border-gray-200">
                    <h2 className="text-3xl font-bold p-8">{'// Меню'}</h2>
                    
                    <div className="flex flex-col px-8 space-y-4">
                        <button onClick={() => navigate('upload')} className="text-left py-2 hover:text-[#FF4500] transition-colors flex items-center">
                            <span className="mr-2 text-[#FF4500]">{'>'}</span> Загрузить изображение
                        </button>
                        <button className="text-left py-2 hover:text-[#FF4500] transition-colors flex items-center">
                            <span className="mr-2 text-[#FF4500]">{'>'}</span> Редактировать план помещения
                        </button>
                        <button className="text-left py-2 hover:text-[#FF4500] transition-colors flex items-center">
                            <span className="mr-2 text-[#FF4500]">{'>'}</span> Редактировать узловые точки
                        </button>
                        <button onClick={() => setHasFiles(!hasFiles)} className="text-left py-2 hover:text-[#FF4500] transition-colors flex items-center text-gray-400 mt-8 text-sm">
                            <span className="mr-2 text-gray-400">{'>'}</span> [Тест: перекл. наличие файлов]
                        </button>
                    </div>
                </div>

                {/* Основная рабочая область */}
                <div className="flex-1 relative overflow-hidden bg-[#E5E5E5]">
                    {!hasFiles ? (
                        // Пустое состояние (Строгий технический стиль)
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* Паттерн в точку */}
                            <div className="absolute inset-0" 
                                 style={{ 
                                     backgroundImage: 'radial-gradient(#A3A3A3 1px, transparent 1px)', 
                                     backgroundSize: '24px 24px',
                                     opacity: 0.4
                                 }}>
                            </div>
                            
                            {/* Информационный блок */}
                            <div className="relative z-10 flex flex-col items-center p-12 bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full text-center">
                                <div className="mb-6 text-gray-300">
                                     <Layout size={80} strokeWidth={1} />
                                </div>
                                <h3 className="text-2xl font-bold text-black mb-3 uppercase tracking-wider">Рабочая область пуста</h3>
                                <div className="w-12 h-1 bg-[#FF4500] mb-4"></div>
                                <p className="text-sm text-gray-500 mb-10 font-mono">SYS.MSG: Требуется загрузка исходных данных для начала работы</p>
                                
                                <button 
                                    onClick={() => navigate('upload')}
                                    className="w-full bg-black text-white px-8 py-4 font-bold hover:bg-[#FF4500] transition-colors font-mono text-sm uppercase tracking-widest flex items-center justify-center group"
                                >
                                    <span>Начать работу</span>
                                    <span className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">{'>'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        // Состояние с файлами
                        <div className="p-8 relative z-10 h-full">
                            <div className="w-64 group">
                                <div className="bg-gray-400 aspect-[4/3] w-full mb-3 border-2 border-transparent group-hover:border-[#FF4500] cursor-pointer transition-all relative overflow-hidden">
                                    {/* Имитация превью картинки */}
                                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 5px 5px' }}></div>
                                </div>
                                <p className="text-sm font-bold uppercase tracking-wide">Корпус А</p>
                                <p className="text-xs text-gray-500 font-mono mt-1">planD3.jpg</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ЭКРАН 4: Загрузка файлов
// ==========================================
const UploadView = ({ navigate }) => {
    const [files, setFiles] = useState([]);

    const handleUploadSimulate = () => {
        // Симуляция загрузки файлов
        setFiles(Array(8).fill('planD3.jpg'));
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#F5F5F5]">
            {/* Верхний бар с навигацией по шагам */}
            <div className="h-14 bg-black flex items-center justify-between px-6 text-white">
                <button onClick={() => navigate('dashboard')} className="hover:text-[#FF4500] transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex space-x-4">
                    <div className="w-4 h-4 rounded-full bg-[#FF4500]"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                </div>
                <button onClick={() => navigate('dashboard')} className="hover:text-[#FF4500] transition-colors">
                    <X size={24} />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Левая часть: Дропзона */}
                <div className="flex-1 p-8 flex items-center justify-center bg-white border-r border-gray-200">
                    <div className="w-full h-full border-2 border-dashed border-[#FF4500] flex flex-col items-center justify-center bg-[#FF4500]/5 hover:bg-[#FF4500]/10 transition-colors cursor-pointer group" onClick={handleUploadSimulate}>
                        <CloudUpload size={100} className="text-[#FF4500] mb-6 group-hover:-translate-y-2 transition-transform duration-300" />
                        <p className="text-xl font-medium mb-6 text-gray-800">Перетащите для загрузки</p>
                        <button className="bg-[#FF4500] text-white px-8 py-3 font-medium hover:bg-black transition-colors">
                            Выбрать файлы
                        </button>
                    </div>
                </div>

                {/* Правая часть: Галерея загруженного */}
                <div className="flex-1 flex flex-col bg-[#EAEAEA]">
                    {files.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-black">
                            <ImageIcon size={100} strokeWidth={1} className="mb-6 opacity-20" />
                            <h3 className="text-xl font-bold">Нет загруженных планов</h3>
                            <p className="text-sm text-gray-500 mt-2 font-mono">Ожидание ввода данных...</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="grid grid-cols-3 gap-6">
                                {files.map((name, i) => (
                                    <div key={i} className="relative group">
                                        <div className="bg-gray-500 aspect-[4/3] w-full shadow-sm"></div>
                                        <p className="text-center text-sm mt-2 text-gray-700 font-mono">{name}</p>
                                        <button className="absolute -top-2 -right-2 bg-[#FF4500] text-white w-6 h-6 flex items-center justify-center hover:bg-black transition-colors opacity-0 group-hover:opacity-100">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Нижний бар управления загрузкой */}
                    <div className="bg-zinc-600 text-white px-6 py-4 flex items-center font-mono text-sm">
                        Загружено {files.length} изображений
                    </div>
                    <div className="h-16 flex bg-white border-t border-gray-200">
                        <button onClick={() => navigate('dashboard')} className="flex-1 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors text-left px-8 font-medium">
                            Назад
                        </button>
                        <button 
                            onClick={() => navigate('editor')}
                            className="flex-1 bg-[#FF4500] text-white hover:bg-[#E03E00] transition-colors text-left px-8 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={files.length === 0}
                        >
                            Далее
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ЭКРАН 5: Редактор
// ==========================================
const EditorView = ({ navigate }) => {
    return (
        <div className="min-h-screen flex flex-col bg-black">
             {/* Верхний бар (Темный) */}
             <div className="h-14 bg-black flex items-center justify-between px-6 text-white border-b border-zinc-800">
                <button onClick={() => navigate('upload')} className="hover:text-[#FF4500] transition-colors">
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                </button>
                <div className="flex space-x-4">
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="w-4 h-4 rounded-full bg-[#FF4500]"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                </div>
                <button onClick={() => navigate('dashboard')} className="hover:text-[#FF4500] transition-colors">
                    <X size={24} />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden bg-zinc-200">
                {/* Левая часть: Канвас (Изображение) */}
                <div className="flex-1 p-8 flex items-center justify-center relative">
                    {/* Сетка на фоне для технического вида */}
                    <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                    
                    <div className="w-full max-w-4xl aspect-[16/9] bg-black shadow-2xl relative flex items-center justify-center border border-zinc-800">
                        <span className="text-white font-mono text-sm tracking-widest opacity-50">IMAGE_DATA_RENDER</span>
                        {/* Имитация UI обрезки из скриншота */}
                        <div className="absolute inset-10 border border-[#FF4500] border-dashed">
                            <div className="absolute -top-1 -left-1 w-2 h-2 bg-[#FF4500]"></div>
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF4500]"></div>
                            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[#FF4500]"></div>
                            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#FF4500]"></div>
                        </div>
                    </div>
                </div>

                {/* Правая часть: Тулбар */}
                <div className="w-80 bg-zinc-900 flex flex-col text-white border-l border-zinc-800 shadow-2xl relative z-10">
                    <div className="p-6 flex-1 space-y-10 overflow-y-auto">
                        
                        {/* Блок: Кадрирование */}
                        <div>
                            <h4 className="font-mono text-xs text-zinc-500 mb-4 uppercase tracking-widest">{'// Размер холста'}</h4>
                            <div className="space-y-3">
                                <button className="w-full flex items-center p-3 border border-[#FF4500] bg-[#FF4500]/10 text-[#FF4500] transition-all group">
                                    <div className="w-10 h-10 flex items-center justify-center mr-4 bg-[#FF4500] text-black">
                                        <Crop size={20} />
                                    </div>
                                    <span className="font-mono text-sm font-bold tracking-wide">Кадрирование</span>
                                </button>
                                <button className="w-full flex items-center p-3 border border-zinc-800 hover:border-zinc-500 text-zinc-400 hover:text-white transition-all group">
                                    <div className="w-10 h-10 flex items-center justify-center mr-4 bg-black group-hover:bg-zinc-800">
                                        <Scan size={20} />
                                    </div>
                                    <span className="font-mono text-sm tracking-wide">Авто-кадрирование</span>
                                </button>
                            </div>
                        </div>

                        {/* Блок: Редактировать */}
                        <div>
                            <h4 className="font-mono text-xs text-zinc-500 mb-4 uppercase tracking-widest">{'// Редактор стен'}</h4>
                            <div className="space-y-3">
                                <button className="w-full flex items-center p-3 border border-zinc-800 hover:border-[#FF4500] text-zinc-400 hover:text-[#FF4500] transition-all group">
                                    <div className="w-10 h-10 flex items-center justify-center mr-4 bg-black group-hover:bg-[#FF4500] group-hover:text-black transition-colors">
                                        <PenLine size={20} />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-mono text-sm tracking-wide">Нарисовать стену</span>
                                    </div>
                                </button>
                                <button className="w-full flex items-center p-3 border border-zinc-800 hover:border-[#FF4500] text-zinc-400 hover:text-[#FF4500] transition-all group">
                                    <div className="w-10 h-10 flex items-center justify-center mr-4 bg-black group-hover:bg-[#FF4500] group-hover:text-black transition-colors">
                                        <Eraser size={20} />
                                    </div>
                                    <span className="font-mono text-sm tracking-wide">Стереть стену</span>
                                </button>
                            </div>
                        </div>

                        {/* Блок: Толщина */}
                        <div className="pt-4 border-t border-zinc-800">
                            <h4 className="font-mono text-xs text-zinc-500 mb-6 uppercase tracking-widest">{'// Толщина линии'}</h4>
                            <div className="flex items-center space-x-4 px-2">
                                <div className="flex-1 h-1 bg-zinc-800 relative">
                                    <div className="absolute left-0 top-0 bottom-0 w-1/3 bg-[#FF4500]"></div>
                                    <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-3 h-6 bg-white cursor-pointer shadow-md hover:scale-110 transition-transform"></div>
                                </div>
                                <span className="font-mono text-xs w-10 text-right text-zinc-400">6 px</span>
                            </div>
                        </div>

                    </div>
                    
                    {/* Навигация внизу тулбара */}
                    <div className="h-16 flex border-t border-zinc-800">
                        <button onClick={() => navigate('upload')} className="w-24 bg-black text-white hover:bg-zinc-800 transition-colors flex items-center justify-center font-mono text-sm font-medium">
                            Назад
                        </button>
                        <button 
                            onClick={() => navigate('vector_plan')} 
                            className="flex-1 bg-[#FF4500] text-black hover:bg-[#E03E00] hover:text-white transition-colors flex items-center justify-center font-mono text-sm font-bold uppercase tracking-widest"
                        >
                            Далее
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ЭКРАН 6: Разметка плана (Вектор)
// ==========================================
const VectorPlanView = ({ navigate }) => {
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [roomData, setRoomData] = useState({});

    // Моковые данные векторизованного плана здания (SVG пути)
    const MOCK_ROOMS = [
        { id: 'r1', path: 'M 50 50 L 250 50 L 250 200 L 50 200 Z', label: 'Помещение 1' },
        { id: 'r2', path: 'M 250 50 L 450 50 L 450 200 L 250 200 Z', label: 'Помещение 2' },
        { id: 'corridor', path: 'M 50 200 L 850 200 L 850 280 L 50 280 Z', label: 'Коридор' },
        { id: 'r3', path: 'M 450 50 L 650 50 L 650 200 L 450 200 Z', label: 'Помещение 3' },
        { id: 'r4', path: 'M 650 50 L 850 50 L 850 200 L 650 200 Z', label: 'Помещение 4' },
        { id: 'r5', path: 'M 50 280 L 350 280 L 350 480 L 50 480 Z', label: 'Помещение 5' },
        { id: 'stairs', path: 'M 350 280 L 500 280 L 500 480 L 350 480 Z', label: 'Лестница' },
        { id: 'r6', path: 'M 500 280 L 850 280 L 850 480 L 500 480 Z', label: 'Помещение 6' }
    ];

    const handleRoomClick = (room) => {
        setSelectedRoom(room);
        // Если данные для комнаты еще не созданы, создаем пустой шаблон
        if (!roomData[room.id]) {
            setRoomData(prev => ({
                ...prev,
                [room.id]: { title: '', type: 'Аудитория', isWalkable: true }
            }));
        }
    };

    const handleDataChange = (field, value) => {
        if (!selectedRoom) return;
        setRoomData(prev => ({
            ...prev,
            [selectedRoom.id]: { ...prev[selectedRoom.id], [field]: value }
        }));
    };

    return (
        <div className="min-h-screen flex flex-col bg-black">
             {/* Верхний бар (Темный) */}
             <div className="h-14 bg-black flex items-center justify-between px-6 text-white border-b border-zinc-800">
                <button onClick={() => navigate('editor')} className="hover:text-[#FF4500] transition-colors">
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                </button>
                <div className="flex space-x-4">
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="w-4 h-4 rounded-full bg-[#FF4500]"></div>
                    <div className="w-4 h-4 rounded-full bg-zinc-700"></div>
                </div>
                <button onClick={() => navigate('dashboard')} className="hover:text-[#FF4500] transition-colors">
                    <X size={24} />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden bg-[#E5E5E5]">
                {/* Левая часть: Векторный Канвас */}
                <div className="flex-1 p-8 flex items-center justify-center relative">
                    <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                    
                    <div className="w-full max-w-5xl aspect-[16/9] bg-white shadow-[10px_10px_0px_0px_rgba(0,0,0,0.1)] relative border-4 border-black p-4 flex items-center justify-center z-10">
                        {/* Водяной знак */}
                        <div className="absolute top-4 left-4 font-mono text-xs font-bold text-gray-300 pointer-events-none">
                            SYS.VECTOR_RENDER // VECTORIZED PLAN
                        </div>

                        <svg viewBox="0 0 900 500" className="w-full h-full drop-shadow-md">
                            {MOCK_ROOMS.map(room => {
                                const isSelected = selectedRoom?.id === room.id;
                                const hasData = roomData[room.id] && roomData[room.id].title !== '';
                                
                                return (
                                    <g key={room.id} onClick={() => handleRoomClick(room)} className="cursor-crosshair">
                                        <path 
                                            d={room.path} 
                                            className={`
                                                transition-all duration-200 stroke-black 
                                                ${isSelected ? 'fill-[#FF4500] stroke-[4px]' : 'fill-transparent hover:fill-[#FF4500]/20 stroke-[3px]'}
                                            `}
                                        />
                                        {/* Если есть введенные данные, показываем маркер */}
                                        {hasData && !isSelected && (
                                            <circle 
                                                cx={room.path.match(/M (\d+)/)[1]} // Примерное вычисление центра (упрощенно для прототипа)
                                                cy={room.path.match(/L (\d+)/)[1]} 
                                                r="4" fill="#FF4500" className="translate-x-10 translate-y-10"
                                            />
                                        )}
                                        {isSelected && (
                                            <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" className="font-mono text-sm pointer-events-none">
                                                ВЫБРАНО
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>

                {/* Правая часть: Панель данных узла */}
                <div className="w-80 bg-zinc-900 flex flex-col text-white border-l border-zinc-800 shadow-2xl relative z-20">
                    <div className="p-6 flex-1 overflow-y-auto">
                        <div className="flex items-center mb-8 pb-4 border-b border-zinc-800">
                            <Database size={20} className="text-[#FF4500] mr-3" />
                            <h4 className="font-mono text-sm uppercase tracking-widest font-bold">Данные узла</h4>
                        </div>

                        {!selectedRoom ? (
                            <div className="text-center mt-20 text-zinc-500 font-mono text-sm border border-dashed border-zinc-700 p-6">
                                <Scan size={40} className="mx-auto mb-4 opacity-50" />
                                SYS.MSG: Выберите замкнутый контур на плане для привязки данных.
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                <div className="bg-[#FF4500]/10 border border-[#FF4500] p-3 flex justify-between items-center mb-6">
                                    <span className="font-mono text-xs text-[#FF4500]">ID: {selectedRoom.id.toUpperCase()}</span>
                                    <Tag size={14} className="text-[#FF4500]" />
                                </div>

                                <div className="space-y-2">
                                    <label className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Идентификатор (Номер)</label>
                                    <input 
                                        type="text" 
                                        value={roomData[selectedRoom.id]?.title || ''}
                                        onChange={(e) => handleDataChange('title', e.target.value)}
                                        placeholder="Напр. Ауд. 312"
                                        className="w-full bg-black border border-zinc-700 p-3 outline-none focus:border-[#FF4500] transition-colors font-sans text-sm"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Тип помещения</label>
                                    <select 
                                        value={roomData[selectedRoom.id]?.type || 'Аудитория'}
                                        onChange={(e) => handleDataChange('type', e.target.value)}
                                        className="w-full bg-black border border-zinc-700 p-3 outline-none focus:border-[#FF4500] transition-colors font-sans text-sm appearance-none"
                                    >
                                        <option>Аудитория</option>
                                        <option>Коридор</option>
                                        <option>Лестница / Лифт</option>
                                        <option>Служебное помещение</option>
                                        <option>Туалет</option>
                                    </select>
                                </div>

                                <div className="pt-4 border-t border-zinc-800">
                                    <label className="flex items-center cursor-pointer group">
                                        <div className="relative">
                                            <input 
                                                type="checkbox" 
                                                checked={roomData[selectedRoom.id]?.isWalkable ?? true}
                                                onChange={(e) => handleDataChange('isWalkable', e.target.checked)}
                                                className="sr-only" 
                                            />
                                            <div className={`w-6 h-6 border ${roomData[selectedRoom.id]?.isWalkable ? 'bg-[#FF4500] border-[#FF4500]' : 'bg-transparent border-zinc-500'} flex items-center justify-center transition-colors group-hover:border-[#FF4500]`}>
                                                {roomData[selectedRoom.id]?.isWalkable && <CheckSquare size={14} className="text-black" />}
                                            </div>
                                        </div>
                                        <div className="ml-3">
                                            <span className="block font-mono text-sm">Зона проходима</span>
                                            <span className="block font-mono text-xs text-zinc-500">Доступно для навигации</span>
                                        </div>
                                    </label>
                                </div>

                                <button className="w-full mt-8 bg-zinc-800 text-white p-4 font-mono text-sm uppercase tracking-widest hover:bg-[#FF4500] hover:text-black transition-colors flex items-center justify-center font-bold">
                                    <Save size={18} className="mr-2" />
                                    Сохранить узел
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* Навигация внизу тулбара */}
                    <div className="h-16 flex border-t border-zinc-800">
                        <button onClick={() => navigate('editor')} className="w-24 bg-black text-white hover:bg-zinc-800 transition-colors flex items-center justify-center font-mono text-sm font-medium">
                            Назад
                        </button>
                        <button onClick={() => navigate('dashboard')} className="flex-1 bg-[#FF4500] text-black hover:bg-[#E03E00] hover:text-white transition-colors flex items-center justify-center font-mono text-sm font-bold uppercase tracking-widest">
                            Завершить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ОСНОВНОЙ КОМПОНЕНТ РАУТИНГА
// ==========================================
export default function App() {
    const [currentView, setCurrentView] = useState('home');

    // Простой роутер
    const renderView = () => {
        switch (currentView) {
            case 'home': return <HomeView navigate={setCurrentView} />;
            case 'map': return <MapUserView navigate={setCurrentView} />;
            case 'login': return <LoginView navigate={setCurrentView} />;
            case 'dashboard': return <DashboardView navigate={setCurrentView} />;
            case 'upload': return <UploadView navigate={setCurrentView} />;
            case 'editor': return <EditorView navigate={setCurrentView} />;
            case 'vector_plan': return <VectorPlanView navigate={setCurrentView} />;
            default: return <HomeView navigate={setCurrentView} />;
        }
    };

    return (
        <div className="font-sans antialiased text-gray-900 selection:bg-[#FF4500] selection:text-white">
            {renderView()}
        </div>
    );
}