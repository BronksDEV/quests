document.addEventListener('DOMContentLoaded', async () => {
    // --- CONFIGURAÇÃO SUPABASE ---
    const SUPABASE_URL = "https://ggqljtbbjavvyvawiwus.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdncWxqdGJiamF2dnl2YXdpd3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNzY0MTgsImV4cCI6MjA3MzY1MjQxOH0.PnMwg10Hu_02lytY91JkfyqlDtAUdB_LpgQLOAJKi04";
    const SUPABASE_BUCKET_NAME = "resultados-provas";
    const { createClient } = supabase;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- VARIÁVEIS GLOBAIS ---
    let examSchedule = [];
    let allFilesCache = [];
    let allStudentsCache = [];
    let currentUserProfile = null;
    
    // --- ELEMENTOS DO DOM ---
    const mainLoginBtn = document.getElementById('main-login-btn');
    const loginModal = document.getElementById('login-modal');
    const loginCloseBtn = document.getElementById('login-close-btn');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const userInfo = document.getElementById('user-info');
    const userNameDisplay = document.getElementById('user-name-display');
    const userRoleDisplay = document.getElementById('user-role-display');
    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const myProfileBtn = document.getElementById('my-profile-btn');
    const mainLogoutBtn = document.getElementById('main-logout-btn');
    const welcomeView = document.getElementById('welcome-view');
    const studentView = document.getElementById('student-view');
    const profileModal = document.getElementById('profile-modal');
    const profileCloseBtn = document.getElementById('profile-close-btn');
    const profileSubmitBtn = document.getElementById('profile-submit-btn');

    // ==========================================================
    //                  LÓGICA DE AUTENTICAÇÃO E PERFIL
    // ==========================================================
    
    async function handleLogin() {
        const btn = loginSubmitBtn;
        const btnText = document.getElementById('login-btn-text');
        const spinner = document.getElementById('login-spinner');
        const errorEl = document.getElementById('login-error');
        
        btn.disabled = true;
        spinner.classList.remove('hidden');
        btnText.classList.add('hidden');
        errorEl.textContent = '';
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            errorEl.textContent = 'Email ou senha inválidos.';
        } else if (data.user) {
            loginModal.classList.add('hidden');
            await checkSessionAndSetupUI();
        }

        btn.disabled = false;
        spinner.classList.add('hidden');
        btnText.classList.remove('hidden');
    }

    async function handleLogout() {
        const spinner = document.getElementById('logout-spinner');
        const icon = document.getElementById('logout-icon');
        mainLogoutBtn.disabled = true;
        spinner.classList.remove('hidden');
        icon.classList.add('hidden');
        
        await supabaseClient.auth.signOut();
        currentUserProfile = null;
        allStudentsCache = [];
        allFilesCache = [];
        location.reload();
    }
    
async function checkSessionAndSetupUI() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session && session.user) {
        // Usa um SELECT direto. Com a nova política, isso vai funcionar para buscar o próprio perfil.
        let { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        // Se o perfil não existe, ele será criado.
        if (!profile && error) {
            console.log("Perfil não encontrado, criando novo perfil...");
            const { data: newProfile, error: insertError } = await supabaseClient
                .from('profiles')
                .insert({ id: session.user.id })
                .select()
                .single();
            
            if (insertError) {
                console.error("Erro crítico ao criar perfil do usuário:", insertError);
                return handleLogout();
            }
            profile = newProfile;
        } else if (error) {
             console.error("Erro ao buscar perfil, RLS pode estar bloqueando:", error);
             return handleLogout();
        }

        currentUserProfile = profile;
        updateUIForLoggedInState(profile);

        if (profile.role === 'aluno' && (!profile.nome_completo || !profile.matricula || !profile.turma)) {
            openProfileModal();
        }
    } else {
        updateUIForLoggedOutState();
    }
}
    
// Localize esta função no seu js/index.js e substitua-a por este bloco
function updateUIForLoggedInState(profile) {
    mainLoginBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');

    // PREENCHE A NOVA ÁREA DE PERFIL
    userNameDisplay.textContent = profile.nome_completo || profile.email; // Mostra nome, ou email como fallback
    userRoleDisplay.textContent = profile.role; // Mostra a role (aluno, professor, admin)
    
    welcomeView.classList.add('hidden');
    
    // VARIÁVEIS DE VERIFICAÇÃO DE ROLE
    const isStudent = profile.role === 'aluno';
    const isProfessor = profile.role === 'professor';
    const isAdmin = profile.role === 'admin';

    // CONTROLE DE VISIBILIDADE DOS BOTÕES
    // Botão Painel: Visível para Professores E Admins
    adminPanelBtn.classList.toggle('hidden', !isProfessor && !isAdmin);
    
    // Botão Meu Perfil: Visível apenas para Alunos
    myProfileBtn.classList.toggle('hidden', isProfessor || isAdmin);
    
    // Aba Criar Conta (dentro do painel): Visível APENAS para Admins
    const createUserTab = document.getElementById('admin-create-user-tab');
    if(createUserTab) { // Verifica se o elemento existe antes de tentar modificar
        createUserTab.classList.toggle('hidden', !isAdmin);
    }
    
    // Exibe a lista de provas para todos os usuários logados
    studentView.classList.remove('hidden');
    if (examSchedule.length === 0) {
        fetchAndRenderExams();
    }
}

    function updateUIForLoggedOutState() {
        mainLoginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        welcomeView.classList.remove('hidden');
        studentView.classList.add('hidden');
        closeAdminPanel();
    }

    function openProfileModal() {
        if (profileModal) {
            document.getElementById('profile-nome').value = currentUserProfile.nome_completo || '';
            document.getElementById('profile-matricula').value = currentUserProfile.matricula || '';
            document.getElementById('profile-turma').value = currentUserProfile.turma || '';
            profileModal.classList.remove('hidden');
        }
    }

    function closeProfileModal() {
        if (profileModal) profileModal.classList.add('hidden');
    }
    
    async function handleProfileUpdate() {
        const btn = profileSubmitBtn,
              btnText = document.getElementById('profile-btn-text'),
              spinner = document.getElementById('profile-spinner'),
              errorEl = document.getElementById('profile-error');
              
        btn.disabled = true; spinner.classList.remove('hidden'); btnText.classList.add('hidden'); errorEl.textContent = '';

        const nome = document.getElementById('profile-nome').value.toUpperCase();
        const matricula = document.getElementById('profile-matricula').value;
        const turma = document.getElementById('profile-turma').value;

        if (!nome || !matricula || !turma) {
            errorEl.textContent = "Todos os campos são obrigatórios.";
            btn.disabled = false; spinner.classList.add('hidden'); btnText.classList.remove('hidden');
            return;
        }

        const { error } = await supabaseClient.from('profiles')
            .update({ nome_completo: nome, matricula: matricula, turma: turma })
            .eq('id', currentUserProfile.id);

        if (error) {
            errorEl.textContent = "Erro ao salvar perfil: " + error.message;
        } else {
            closeProfileModal();
            await checkSessionAndSetupUI();
        }
        btn.disabled = false; spinner.classList.add('hidden'); btnText.classList.remove('hidden');
    }

        // NOVA FUNÇÃO PARA FORMATAR MATRÍCULA
    function formatarMatricula(event) {
        const input = event.target;
        let value = input.value.replace(/\D/g, ''); // Remove tudo que não for dígito
        value = value.substring(0, 11); // Limita a 11 dígitos
        
        if (value.length > 10) {
            value = value.replace(/(\d{10})(\d)/, '$1-$2'); // Adiciona o hífen
        }
        
        input.value = value;
    }

    // ==========================================================
    //          LÓGICA DE PROVAS (VISUALIZAÇÃO E ACESSO)
    // ==========================================================
    
    async function fetchExams() {
        const { data, error } = await supabaseClient.from('provas').select('*').order('area', { ascending: true }).order('serie', { ascending: true });
        if (error) { console.error("Erro ao buscar provas:", error); return []; }
        
        const groupedByArea = data.reduce((acc, exam) => {
            const { id, area, id_area, serie, arquivo_url, data_inicio, data_fim } = exam;
            if (!acc[id_area]) acc[id_area] = { area: area, id: id_area, exams: [] };
            acc[id_area].exams.push({ id, series: serie, file: arquivo_url, startDate: data_inicio, endDate: data_fim, areaName: area });
            return acc;
        }, {});
        return Object.values(groupedByArea);
    }
    
    async function fetchAndRenderExams() {
        const portal = document.getElementById('exam-portal');
        const loader = document.getElementById('loading-exams');
        examSchedule = await fetchExams();
        
        if (examSchedule.length === 0) {
            loader.innerHTML = '<p class="text-slate-500">Nenhuma avaliação agendada no momento.</p>';
            return;
        }
        loader.classList.add('hidden');
        portal.classList.remove('hidden');
        renderTabsAndContents(examSchedule);
    }
    
    function renderTabsAndContents(schedule) {
        const tabsContainer = document.getElementById('tabs');
        const tabContainer = document.getElementById('tab-container');
        tabsContainer.innerHTML = '';
        tabContainer.innerHTML = '';
        
        schedule.forEach((areaData, index) => {
            const isActive = index === 0;
            tabsContainer.innerHTML += `<button class="tab-btn shrink-0 border-b-2 px-1 py-4 text-sm font-medium ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}" data-tab="${areaData.id}">${areaData.area}</button>`;
            tabContainer.innerHTML += `<div id="${areaData.id}-content" class="${isActive ? '' : 'hidden'} tab-content grid grid-cols-1 md:grid-cols-3 gap-8"></div>`;
        });

        if (schedule.length > 0) {
            renderExamsForTab(schedule[0].id);
        }
    }
    
    function renderExamsForTab(tabId) {
        const areaData = examSchedule.find(a => a.id === tabId);
        const container = document.getElementById(`${tabId}-content`);
        if (!container) return;
        container.innerHTML = '';
        
        areaData.exams.forEach((exam, cardIndex) => {
            const now = new Date();
            const startDate = new Date(exam.startDate);
            const endDate = new Date(exam.endDate);
            let status = (now < startDate) ? 'locked' : (now > endDate) ? 'expired' : 'available';
            
            const wrapper = document.createElement('div');
            wrapper.className = `exam-card-wrapper ${status}`;
            
            const card = document.createElement('div');
            card.dataset.exam = JSON.stringify(exam);
            card.dataset.status = status;
            card.className = `exam-card h-full relative p-8 rounded-2xl shadow-lg border border-slate-200/50 transition-all duration-300 ease-in-out ${status === 'expired' && currentUserProfile.role === 'admin' ? `cursor-pointer group hover:scale-[1.03] hover:shadow-2xl` : (status === 'expired' ? 'opacity-50 grayscale cursor-not-allowed' : `cursor-pointer group hover:scale-[1.03] hover:shadow-2xl`)}`;

            const statusText = status === 'locked' ? `<p class="text-xs font-semibold text-amber-600">Disponível em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(startDate)}</p>` : status === 'expired' ? `<p class="text-xs font-semibold text-slate-500">Avaliação Encerrada</p>` : `<p class="text-xs font-semibold text-green-600">Disponível para Iniciar</p>`;
            
            card.innerHTML = `<div class="text-center"><div class="flex items-center justify-center w-20 h-20 mx-auto bg-blue-100 rounded-full mb-5 ring-4 ring-white transition-colors group-hover:bg-blue-200"><span class="text-4xl font-bold text-blue-600">${exam.series.replace('ª Série', '')}</span><span class="text-lg font-bold mt-2 text-blue-600">ª</span></div><h2 class="text-2xl font-bold text-slate-800">Série</h2><p class="text-slate-500 mt-2">${areaData.area}</p><div class="mt-4">${statusText}</div></div>`;
            
            wrapper.appendChild(card);
            container.appendChild(wrapper);
        });

        container.querySelectorAll('.exam-card').forEach(c => c.addEventListener('click', handleExamCardClick));
    }

    function handleTabClick(e) {
        const tabId = e.target.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(t => {
            t.classList.remove('border-blue-600', 'text-blue-600');
            t.classList.add('border-transparent', 'text-gray-500');
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        e.target.classList.add('border-blue-600', 'text-blue-600');
        e.target.classList.remove('border-transparent', 'text-gray-500');
        document.getElementById(`${tabId}-content`).classList.remove('hidden');
        renderExamsForTab(tabId);
    }
    
 async function handleExamCardClick() {
    if (!currentUserProfile) return alert("Por favor, faça o login para iniciar uma prova.");
    
    // Antes de tudo, busca a versão mais recente do perfil do usuário.
    const { data: latestProfile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUserProfile.id)
        .single();
    
    if (profileError || !latestProfile) {
        return alert("Ocorreu um erro ao verificar suas permissões. Por favor, tente novamente.");
    }
    
    currentUserProfile = latestProfile;

    const { status, exam } = this.dataset;
    const examData = JSON.parse(exam);

    if (currentUserProfile.role === 'aluno') {
        if (!currentUserProfile.nome_completo || !currentUserProfile.matricula || !currentUserProfile.turma) {
            return openProfileModal();
        }
        const studentSeries = currentUserProfile.turma.charAt(0);
        const examSeries = examData.series.charAt(0);
        if (studentSeries !== examSeries) return alert("Esta avaliação não está disponível para a sua série.");
        
        const presenceAllowedUntil = currentUserProfile.presenca_liberada_ate ? new Date(currentUserProfile.presenca_liberada_ate) : null;
        const hasPresencePermission = presenceAllowedUntil && new Date() < presenceAllowedUntil;
        
        if (status === 'expired') return;
        if (!hasPresencePermission && currentUserProfile.permitido_individual !== true) {
            return alert('Acesso negado. Aguarde a liberação do professor ou administrador.');
        }
        if (status === 'locked' && currentUserProfile.permitido_individual !== true) {
            return alert('Esta prova ainda não está disponível.');
        }
    }
    
    document.getElementById('page-loader').classList.remove('hidden');

    // **A CORREÇÃO:** Salvando os dados da PROVA no localStorage.
    localStorage.setItem('currentExamInfo', JSON.stringify(examData));
    
    setTimeout(() => {
        window.open(examData.file, '_blank');
        document.getElementById('page-loader').classList.add('hidden');
    }, 500);
}
    
    // ==========================================================
    //           LÓGICA DO PAINEL DO PROFESSOR/ADMIN
    // ==========================================================
    
    function openAdminPanel() {
        document.getElementById('admin-area').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('admin-area-content').classList.remove('translate-x-full'), 10);
        
        document.getElementById('professor-email').textContent = currentUserProfile.email;
        if (examSchedule.length > 0) {
            renderAdminExamsList();
        }
    }

    function closeAdminPanel() {
        document.getElementById('admin-area-content').classList.add('translate-x-full');
        setTimeout(() => { document.getElementById('admin-area').classList.add('hidden'); document.body.style.overflow = ''; }, 500);
    }
    
    function renderAdminExamsList() {
        const list = document.getElementById('exams-admin-list');
        list.innerHTML = '';
        const allExams = examSchedule.flat().flatMap(area => area.exams.map(exam => ({...exam})))
            .sort((a, b) => (a.areaName || '').localeCompare(b.areaName || '') || a.series.localeCompare(b.series));

        allExams.forEach(exam => {
            const toLocalISOString = date => new Date(new Date(date).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            list.innerHTML += `
                <div data-exam-id="${exam.id}" class="bg-slate-50 p-4 rounded-lg border flex flex-col md:flex-row items-start md:items-center gap-4">
                    <div class="flex-grow"><p class="font-bold text-slate-800">${exam.areaName} - ${exam.series}</p><p class="text-sm text-slate-500">${exam.file}</p></div>
                    <div class="w-full md:w-auto flex flex-col md:flex-row items-stretch md:items-center gap-4">
                        <div class="flex items-center gap-2"><label class="text-sm font-medium" for="start-${exam.id}">Início:</label><input type="datetime-local" id="start-${exam.id}" value="${toLocalISOString(exam.startDate)}" class="border-gray-300 rounded-md shadow-sm text-sm p-2 w-full"></div>
                        <div class="flex items-center gap-2"><label class="text-sm font-medium" for="end-${exam.id}">Fim:</label><input type="datetime-local" id="end-${exam.id}" value="${toLocalISOString(exam.endDate)}" class="border-gray-300 rounded-md shadow-sm text-sm p-2 w-full"></div>
                        <button class="update-exam-btn w-full md:w-auto bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded transition flex justify-center items-center h-10" title="Salvar Alterações">
                           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        </button>
                    </div>
                </div>`;
        });
    }
        
    async function handleExamUpdate(e) {
        const btn = e.target.closest('.update-exam-btn'); if (!btn) return;
        const examItem = btn.closest('[data-exam-id]');
        const examId = examItem.dataset.examId;
        const startDateString = examItem.querySelector(`#start-${examId}`).value;
        const endDateString = examItem.querySelector(`#end-${examId}`).value;
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-left-color:white;"></div>`;
        const { error } = await supabaseClient.from('provas').update({ data_inicio: startDateString, data_fim: endDateString }).eq('id', examId);
        if (error) {
            console.error("Erro ao atualizar prova:", error);
            alert('Falha ao salvar.');
        }
        await reloadAllExams();
    }

    async function reloadAllExams() {
        examSchedule = await fetchExams();
        if(!document.getElementById('student-view').classList.contains('hidden')) {
            renderTabsAndContents(examSchedule);
        }
        if (!document.getElementById('admin-area').classList.contains('hidden')) { 
            renderAdminExamsList();
        }
    }
    
// Substitua a função handleCreateUser inteira por esta
async function handleCreateUser() {
    const btn = document.getElementById('create-user-submit-btn'),
          btnText = document.getElementById('create-user-btn-text'),
          spinner = document.getElementById('create-user-spinner'),
          feedbackEl = document.getElementById('create-user-feedback');
              
    btn.disabled = true; spinner.classList.remove('hidden'); btnText.classList.add('hidden'); feedbackEl.textContent = '';

    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    if (!email || !password || !role) {
        feedbackEl.textContent = "Todos os campos são obrigatórios.";
        feedbackEl.style.color = 'red';
        btn.disabled = false; spinner.classList.add('hidden'); btnText.classList.remove('hidden');
        return;
    }

    try {
        // CHAMA A EDGE FUNCTION SEGURA
        const { data, error } = await supabaseClient.functions.invoke('create-user', {
            body: { email, password, role },
        })

        if (error) throw error; // Joga o erro para o bloco catch

        feedbackEl.textContent = data.message;
        feedbackEl.style.color = 'green';
        document.getElementById('new-user-email').value = '';
        document.getElementById('new-user-password').value = '';
        allStudentsCache = []; // Força a recarga da lista de alunos

    } catch (error) {
        // Se a Edge Function retornar um erro, ele será capturado aqui
        const errorMessage = error.context?.body?.error || error.message;
        feedbackEl.textContent = `Erro: ${errorMessage}`;
        feedbackEl.style.color = 'red';
    } finally {
        btn.disabled = false; spinner.classList.add('hidden'); btnText.classList.remove('hidden');
    }
}

    async function setupPresencePanel() {
        const loader = document.getElementById('presence-loader'), content = document.getElementById('presence-content');
        content.classList.add('hidden'); loader.style.display = 'flex';
        
        allStudentsCache = await fetchAllStudents();
        const turmas = [...new Set(allStudentsCache.map(s => s.turma).filter(Boolean))].sort();

        const classSelect = document.getElementById('class-select');
        classSelect.innerHTML = '<option value="">Selecione uma turma...</option>';
        turmas.forEach(turma => classSelect.innerHTML += `<option value="${turma}">${turma}</option>`);

        loader.style.display = 'none'; content.classList.remove('hidden');
        renderPresenceList([]);
    }
    
function renderPresenceList(students) {
    const listContainer = document.getElementById('presence-list');
    listContainer.innerHTML = '';
    document.getElementById('no-presence-message').classList.toggle('hidden', students.length > 0);
    
    students.forEach(student => {
        const presenceAllowedUntil = student.presenca_liberada_ate ? new Date(student.presenca_liberada_ate) : null;
        const isCurrentlyAllowed = presenceAllowedUntil && (new Date() < presenceAllowedUntil);
        
        let statusText = 'Bloqueado';
        let buttonText = 'Liberar';
        let buttonClass = 'bg-green-500 hover:bg-green-600';

        if(isCurrentlyAllowed) {
            statusText = `Liberado até ${presenceAllowedUntil.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
            buttonText = 'Bloquear';
            buttonClass = 'bg-red-500 hover:bg-red-600';
        }
        
        listContainer.innerHTML += `
            <div class="bg-slate-50 p-3 rounded-lg flex items-center gap-4 border">
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg class="w-5 h-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" /></svg>
                </div>
                <div class="flex-grow min-w-0">
                    <p class="font-semibold text-sm text-slate-800 truncate" title="${student.nome_completo || ''}">${student.nome_completo || 'Nome não preenchido'}</p>
                    <p class="text-xs ${isCurrentlyAllowed ? 'text-green-600 font-medium' : 'text-slate-500'}">Status: ${statusText}</p>
                </div>
                <button data-student-id="${student.id}" data-should-allow="${!isCurrentlyAllowed}" class="toggle-presence-btn w-24 h-9 flex items-center justify-center text-xs font-bold text-white rounded-md transition ${buttonClass}">
                    ${buttonText}
                </button>
            </div>`;
    });
}

    function applyPresenceFilter() {
        const selectedClass = document.getElementById('class-select').value;
        const query = document.getElementById('filter-presence').value.toLowerCase().trim();
        
        if (!selectedClass) { renderPresenceList([]); return; }
        let filtered = allStudentsCache.filter(s => s.turma === selectedClass);
        if (query) {
            filtered = filtered.filter(s => 
                (s.nome_completo && s.nome_completo.toLowerCase().includes(query)) || 
                (s.matricula && s.matricula.toLowerCase().includes(query))
            );
        }
        renderPresenceList(filtered);
    }
    
// Localize esta função no seu js/index.js e substitua-a inteiramente.

async function handleTogglePresence(e) {
    e.stopPropagation(); // Impede que o evento se propague para outros elementos.
    
    const btn = e.target.closest('.toggle-presence-btn');
    if (!btn) return;
    
    btn.disabled = true; 
    btn.innerHTML = `<div class="spinner" style="width:16px; height:16px; border-left-color:white;"></div>`;
    
    const studentId = btn.dataset.studentId;
    const shouldAllow = btn.dataset.shouldAllow === 'true'; // Converte a string do HTML para booleano.

    // AQUI ESTÁ A CORREÇÃO:
    // Os nomes dos parâmetros agora correspondem exatamente aos definidos na sua função SQL.
    const { error } = await supabaseClient.rpc('update_student_presence', {
        student_id: studentId,   // Nome correto do parâmetro 1
        should_allow: shouldAllow  // Nome correto do parâmetro 2
    });

    if (error) {
        alert("Erro ao atualizar status do aluno: " + error.message);
        // Em caso de erro, recarrega a lista do zero para garantir consistência.
        allStudentsCache = await fetchAllStudents();
        applyPresenceFilter();
        return;
    }

    // Se a operação foi bem-sucedida, atualizamos a informação local (cache) para uma resposta visual instantânea.
    const studentInCache = allStudentsCache.find(s => s.id == studentId);
    if (studentInCache) {
       // Simula a mudança que o backend fez.
       studentInCache.presenca_liberada_ate = shouldAllow ? new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString() : null;
    }
    
    // Re-renderiza a lista da turma atual com os dados da cache, agora atualizados.
    applyPresenceFilter(); 
}

// Substitua a função fetchAllStudents
async function fetchAllStudents() {
    // Para contornar a RLS restritiva, os professores/admins vão chamar uma RPC.
    const { data, error } = await supabaseClient.rpc('get_all_students');
    
    if (error) {
        console.error("Erro ao buscar alunos via RPC: ", error);
        alert("Acesso à lista de alunos negado ou ocorreu um erro.");
        return [];
    }
    return data || [];
}
    
    // --- LÓGICA DE RESULTADOS/GABARITOS ---
    async function fetchAllResults() {
        const foundFiles = [];
        async function listRec(path = '') {
            const { data, error } = await supabaseClient.storage.from(SUPABASE_BUCKET_NAME).list(path, { limit: 2000 });
            if (error) { console.error("Erro ao listar storage:", error); return; }
            for (const item of data) {
                if (item.name === '.emptyFolderPlaceholder') continue;
                const looksLikeFolder = !item.name.includes('.');
                if (looksLikeFolder) await listRec(path ? `${path}/${item.name}` : item.name);
                else foundFiles.push({ fullPath: path ? `${path}/${item.name}` : item.name, fileName: item.name });
            }
        }
        await listRec('');
        return foundFiles.map(file => {
            const parts = file.fullPath.split('/');
            const studentInfo = parts[parts.length-1].replace(/\.pdf$/i, '');
            const series = parts.length > 0 ? parts[0].replace(/_/g, ' ') : '';
            const turma = parts.length > 1 ? parts[1].replace(/^TURMA_/, '').replace(/_/g, ' ') : '';
            return { fullPath: file.fullPath, series, class: turma, studentInfo };
        });
    }

    function renderResultsList(files) {
        const list = document.getElementById('results-list');
        list.innerHTML = '';
        document.getElementById('no-results-message').classList.toggle('hidden', files.length > 0);
        files.forEach(file => {
            const [matricula, ...nomeParts] = file.studentInfo.split('-');
            const nome = nomeParts.join(' ').trim() || file.studentInfo;
            list.innerHTML += `
              <div class="bg-slate-50 p-3 rounded-lg flex items-center gap-4 border">
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg class="w-5 h-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" /></svg>
                </div>
                <div class="flex-grow min-w-0"><p class="font-semibold text-sm text-slate-800 truncate" title="${nome}">${nome}</p><p class="text-xs text-slate-500">${file.series} • Turma ${file.class}</p></div>
                <button data-path="${file.fullPath}" class="download-single-btn flex-shrink-0 bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></button>
              </div>`;
        });
    }
    
    function applyFilters() {
        const query = document.getElementById('filter-student').value.toLowerCase().trim();
        if (!allFilesCache) return;
        const filtered = allFilesCache.filter(file => `${file.studentInfo} ${file.series} ${file.class}`.toLowerCase().replace(/_/g, ' ').includes(query));
        renderResultsList(filtered);
    }

    async function downloadAllFiltered() {
        const btn = document.getElementById('download-all-filtered-btn');
        const filesToDownload = allFilesCache.filter(file => `${file.studentInfo} ${file.series} ${file.class}`.toLowerCase().includes(document.getElementById('filter-student').value.toLowerCase().trim()));
        if (!filesToDownload.length) return alert("Nenhum arquivo para baixar.");
        btn.disabled = true; btn.innerHTML = `<div class="spinner mr-2"></div>Baixando ${filesToDownload.length} arquivos...`;
        const zip = new JSZip();
        try {
            await Promise.all(filesToDownload.map(async file => {
                const { data, error } = await supabaseClient.storage.from(SUPABASE_BUCKET_NAME).download(file.fullPath);
                if (error) throw new Error(`Falha ao baixar ${file.fullPath}`);
                zip.file(file.fullPath, data);
            }));
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "Resultados_Filtrados.zip");
        } catch (error) {
            console.error("Erro zip:", error);
            alert("Ocorreu um erro ao baixar os arquivos.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `Baixar Filtrados (.zip)`;
        }
    }
    
    // ==========================================================
    //                        INICIALIZAÇÃO E LISTENERS
    // ==========================================================
    function setupEventListeners() {
        mainLoginBtn.addEventListener('click', () => loginModal.classList.remove('hidden'));
        loginCloseBtn.addEventListener('click', () => loginModal.classList.add('hidden'));
        loginSubmitBtn.addEventListener('click', handleLogin);
        mainLogoutBtn.addEventListener('click', handleLogout);
        myProfileBtn.addEventListener('click', openProfileModal);
        profileSubmitBtn.addEventListener('click', handleProfileUpdate);
        profileCloseBtn.addEventListener('click', closeProfileModal);
        
        adminPanelBtn.addEventListener('click', openAdminPanel);
        document.getElementById('admin-close-btn').addEventListener('click', closeAdminPanel);
        document.getElementById('exams-admin-list').addEventListener('click', handleExamUpdate);
        document.getElementById('create-user-submit-btn').addEventListener('click', handleCreateUser);
        
        
        document.querySelectorAll('.admin-panel-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                document.querySelectorAll('.admin-panel-tab, .admin-panel').forEach(el => {
                    if(el.classList.contains('admin-panel-tab')) el.classList.remove('border-blue-600', 'text-blue-600');
                    else el.classList.add('hidden');
                });
                tab.classList.add('border-blue-600', 'text-blue-600');
                document.getElementById(`admin-panel-${tab.dataset.panel}`).classList.remove('hidden');

                if (tab.dataset.panel === 'presenca' && allStudentsCache.length === 0) await setupPresencePanel();
                if (tab.dataset.panel === 'gabaritos' && allFilesCache.length === 0) {
                    const loader = document.getElementById('results-loader'), content = document.getElementById('results-content');
                    content.classList.add('hidden'); loader.style.display = 'flex';
                    allFilesCache = await fetchAllResults();
                    renderResultsList(allFilesCache);
                    loader.style.display = 'none'; content.classList.remove('hidden');
                }
            });
        });
        
        document.getElementById('class-select').addEventListener('change', applyPresenceFilter);
        document.getElementById('filter-presence').addEventListener('input', applyPresenceFilter);
        document.getElementById('presence-list').addEventListener('click', handleTogglePresence);
        document.getElementById('filter-student').addEventListener('input', applyFilters);
        document.getElementById('download-all-filtered-btn').addEventListener('click', downloadAllFiltered);
        
        document.getElementById('results-list').addEventListener('click', async (e) => {
            const btn = e.target.closest('.download-single-btn');
            if (!btn) return;
            btn.disabled = true;
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<div class="spinner"></div>`;
            const { data, error } = await supabaseClient.storage.from(SUPABASE_BUCKET_NAME).download(btn.dataset.path);
            if (error) { alert("Não foi possível baixar o arquivo."); } 
            else { saveAs(data, btn.dataset.path.split('/').pop()); }
            btn.disabled = false;
            btn.innerHTML = originalContent;
        });
        
        document.getElementById('tabs').addEventListener('click', (e) => { if (e.target.classList.contains('tab-btn')) handleTabClick(e); });
    }

    async function init() {
        setupEventListeners();
        await checkSessionAndSetupUI();
    }
    
    init();
});