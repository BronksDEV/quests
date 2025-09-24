// ==========================================================
//          TEMPLATE DE SCRIPT ÚNICO PARA PROVAS
//               VERSÃO FINAL E SEGURA
// ==========================================================

(async function initializeExam() {
    
    function showErrorScreen(message) {
        document.body.innerHTML = `<div style="text-align: center; padding: 50px; font-family: sans-serif;">
            <h1>Acesso Negado</h1>
            <p>${message}</p>
            <p style="margin-top: 10px; font-size: 0.9em; color: grey;">Por favor, feche esta aba e tente iniciar a prova a partir do portal principal novamente.</p>
        </div>`;
    }

    // 1. CONFIGURAÇÃO DO SUPABASE
    const SUPABASE_URL = "https://ggqljtbbjavvyvawiwus.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdncWxqdGJiamF2dnl2YXdpd3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNzY0MTgsImV4cCI6MjA3MzY1MjQxOH0.PnMwg10Hu_02lytY91JkfyqlDtAUdB_LpgQLOAJKi04";
    const { createClient } = supabase;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // 2. VERIFICAÇÃO DE SESSÃO E REVALIDAÇÃO DE PERMISSÃO
    let studentProfile;
    const examInfo = JSON.parse(localStorage.getItem('currentExamInfo')) || {};

    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session || !session.user) {
            throw new Error("Sessão não encontrada. Por favor, faça o login no portal principal.");
        }

        const { data: latestProfile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
            
        if (profileError || !latestProfile) {
            throw new Error("Não foi possível verificar suas permissões atuais. Sua sessão pode ter expirado.");
        }
        
        studentProfile = latestProfile;

        const presenceAllowedUntil = studentProfile.presenca_liberada_ate ? new Date(studentProfile.presenca_liberada_ate) : null;
        const hasPresencePermission = presenceAllowedUntil && new Date() < presenceAllowedUntil;
        
        if (studentProfile.role === 'aluno' && !hasPresencePermission && studentProfile.permitido_individual !== true) {
            throw new Error("Seu acesso a esta prova foi revogado ou expirou.");
        }
    } catch (err) {
        return showErrorScreen(err.message);
    }
    
    // --- O restante das variáveis é definido APÓS a autenticação bem-sucedida ---
    const quizForm = document.getElementById('quizForm');
    const quizHeader = document.getElementById('quiz-header');
    const modalRoot = document.getElementById('modalRoot');
    const startFullscreenBtn = document.getElementById('start-fullscreen-btn');
    const startExamOverlay = document.getElementById('start-exam-overlay');
    const navigationContainer = document.getElementById('quiz-navigation');
    const submitContainer = document.getElementById('submit-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const pageIndicator = document.getElementById('page-indicator');
    
    const SERIES_ID = quizForm.dataset.seriesId || 'ID_PROVA_DESCONHECIDO';
    const PROGRESS_KEY = `progress_${SERIES_ID}_${studentProfile.matricula}`;
    
    let expulsionTimer = null, countdownInterval = null, permissionCheckInterval = null;
    let currentPage = 1, questionsPerPage = 5, allQuestions = [], totalPages = 1;

    // ==========================================================
    //                  SISTEMA DE DEFESA E SEGURANÇA
    // ==========================================================

    function enterFullscreen() {
        const element = document.documentElement;
        if (element.requestFullscreen) {
            element.requestFullscreen().catch(err => {
                alert(`Erro ao iniciar tela cheia. Por favor, permita o modo tela cheia para começar.\nDetalhe: ${err.message}`);
                startExamOverlay.style.display = 'flex';
            });
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }
    
    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    }

    async function revokeAccess() {
        if (expulsionTimer) clearTimeout(expulsionTimer);
        if (countdownInterval) clearInterval(countdownInterval);
        if (permissionCheckInterval) clearInterval(permissionCheckInterval);
        expulsionTimer = null;
        countdownInterval = null;
        permissionCheckInterval = null;

        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);

        await supabaseClient.rpc('self_revoke_presence');
        
        kickOut("Sua avaliação foi cancelada por sair do modo tela cheia. Peça ao professor para liberá-la novamente.");
    }
    
    function kickOut(message) {
        saveProgress();
        document.body.innerHTML = `<div style="text-align: center; padding: 50px; font-family: sans-serif;">
            <h1>Acesso Encerrado</h1>
            <p>${message}</p>
            <p style="margin-top: 10px; font-size: 0.9em; color: grey;">Suas respostas foram salvas até este ponto. Por favor, entre em contato com o administrador.</p>
        </div>`;
    }

    function handleFullscreenChange() {
        if (!isFullscreen()) {
            if (!expulsionTimer) {
                let secondsLeft = 3;
                showToast(`ALERTA: Volte para tela cheia ou sua avaliação será cancelada em ${secondsLeft}...`, 'error');
                countdownInterval = setInterval(() => {
                    secondsLeft--;
                    if(secondsLeft > 0) {
                        showToast(`ALERTA: Volte para tela cheia ou sua avaliação será cancelada em ${secondsLeft}...`, 'error');
                    }
                    if (secondsLeft <= 0) clearInterval(countdownInterval);
                }, 1000);
                expulsionTimer = setTimeout(revokeAccess, 3000);
            }
        } else {
            if (expulsionTimer) {
                clearTimeout(expulsionTimer);
                clearInterval(countdownInterval);
                expulsionTimer = null;
                countdownInterval = null;
                showToast('Ok, você voltou a tempo.', 'info');
            }
        }
    }
    
    function startPermissionChecker() {
        if (permissionCheckInterval) clearInterval(permissionCheckInterval);
        permissionCheckInterval = setInterval(async () => {
            if (document.hidden) return;
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('presenca_liberada_ate, permitido_individual')
                .eq('id', studentProfile.id)
                .single();
            if (error || !data) {
                clearInterval(permissionCheckInterval);
                return kickOut("Sua sessão se tornou inválida. A prova será encerrada.");
            }
            const presenceAllowedUntil = data.presenca_liberada_ate ? new Date(data.presenca_liberada_ate) : null;
            const hasPresencePermission = presenceAllowedUntil && new Date() < presenceAllowedUntil;
            if (!hasPresencePermission && data.permitido_individual !== true) {
                clearInterval(permissionCheckInterval);
                kickOut("Seu tempo de acesso à prova foi encerrado pelo professor.");
            }
        }, 300000);
    }

     // ==========================================================
    //                  LÓGICA DE PAGINAÇÃO
    // ==========================================================
    
    function setupPagination() {
        allQuestions = qsa('fieldset[id^="q"]', quizForm);
        totalPages = Math.ceil(allQuestions.length / questionsPerPage);
        
        if (totalPages <= 1) { // Se só tem uma página, não mostra a navegação
            navigationContainer.style.display = 'none';
            submitContainer.style.display = 'flex';
            allQuestions.forEach(q => q.style.display = 'block');
            return;
        }

        prevBtn.addEventListener('click', () => changePage(currentPage - 1));
        nextBtn.addEventListener('click', () => changePage(currentPage + 1));
        
        changePage(1); // Exibe a primeira página inicialmente
    }
    
    function changePage(pageNumber) {
        if (pageNumber < 1 || pageNumber > totalPages) return;
        currentPage = pageNumber;
        allQuestions.forEach(q => q.style.display = 'none');
        const startIndex = (currentPage - 1) * questionsPerPage;
        const endIndex = startIndex + questionsPerPage;
        const questionsToShow = allQuestions.slice(startIndex, endIndex);
        questionsToShow.forEach(q => q.style.display = 'block');
        updateNavigationUI();
    }
    
    function updateNavigationUI() {
        if (!navigationContainer) return;
        navigationContainer.classList.remove('hidden');
        pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.style.display = currentPage === totalPages ? 'none' : 'inline-flex';
        submitContainer.style.display = currentPage === totalPages ? 'flex' : 'none';
        quizHeader.scrollIntoView({ behavior: 'smooth' });
    }
    
    // ==========================================================
    //                  FUNÇÕES AUXILIARES COMPLETAS
    // ==========================================================

    function qs(sel, ctx = document) { return ctx.querySelector(sel); }
    function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }
    function normalizeString(str) {
      if (!str) return '';
      let normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normalized.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    }
    function createModal(htmlContent) { if (!modalRoot) return; modalRoot.innerHTML = `<div class="modal-backdrop" style="display:flex; align-items:center; justify-content:center; position:fixed; inset:0;"><div class="modal">${htmlContent}</div></div>`; }
    function closeModal() { if (modalRoot) modalRoot.innerHTML = ''; }
    function showToast(text, type = 'info') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.background = type === 'error' ? '#dc2626' : (type === 'warn' ? '#f59e0b' : '#16a34a');
        t.style.zIndex = '99999';
        t.textContent = text;
        document.body.appendChild(t);
        setTimeout(() => { t.style.transition = 'opacity 400ms'; t.style.opacity = '0'; }, 3500);
        setTimeout(() => t.remove(), 4000);
    }

    // ==========================================================
    //                  LÓGICA DA INTERFACE DA PROVA
    // ==========================================================

    function setupQuizHeader() {
        if (!quizHeader) return;
        const firstName = studentProfile.nome_completo ? studentProfile.nome_completo.split(' ')[0] : 'Aluno(a)';
        quizHeader.innerHTML = `
            <div class="flex-grow">
                <h1 class="text-xl sm:text-2xl font-bold">${examInfo.areaName || 'Avaliação'} (${examInfo.series})</h1>
                <p class="text-sm text-gray-600">Boa sorte, ${firstName}!</p>
            </div>
            <div class="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow">
                <svg class="w-6 h-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" /></svg>
            </div>`;
    }
    
    function insertImagesAuto(folderPath) {
        if (!folderPath) { console.warn("Caminho da pasta de imagens não definido."); return; }
        const placeholders = qsa('div.border-dashed[data-img-name]');
        function tryLoad(candidates) { return new Promise((resolve, reject) => { let i = 0; const next = () => { if (i >= candidates.length) return reject(); const url = candidates[i++]; const img = new Image(); img.onload = () => resolve(url); img.onerror = next; img.src = url; }; next(); }); }
        placeholders.forEach(ph => {
            const imgName = ph.dataset.imgName;
            if (!imgName) return;
            const exts = ['webp', 'jpg', 'jpeg', 'png', 'gif'];
            const candidates = exts.map(ext => `${folderPath}/${imgName}.${ext}`);
            const altText = `Imagem da questão ${imgName}`;
            tryLoad(candidates).then(src => {
                ph.innerHTML = `<img src="${src}" alt="${altText}" class="mx-auto max-w-full h-auto rounded shadow clickable-img" loading="lazy">`;
                ph.classList.remove('border-dashed'); ph.style.border = 'none'; ph.style.minHeight = 'auto';
            }).catch(() => {
                ph.innerHTML = `<p class="text-xs text-gray-500">Imagem "${imgName}" indisponível.</p>`;
            });
        });
        if (!qs('#lb')) { const lb = document.createElement('div'); lb.id = 'lb'; lb.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);z-index:9999;padding:20px;cursor:zoom-out;'; lb.innerHTML = '<img id="lb-img" style="max-width:95%;max-height:95%;border-radius:6px;"/>'; document.body.appendChild(lb); lb.addEventListener('click', () => { lb.style.display = 'none'; qs('#lb-img').src = ''; }); }
        document.addEventListener('click', function (e) { if (e.target?.classList.contains('clickable-img')) { qs('#lb-img').src = e.target.src; qs('#lb').style.display = 'flex'; } });
    }
    
    function saveProgress() {
        if (!quizForm) return;
        const formData = new FormData(quizForm);
        const currentAnswers = {};
        for (let [key, value] of formData.entries()) { currentAnswers[key] = value; }
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers: currentAnswers }));
    }

    function restoreProgress() {
        const savedProgress = localStorage.getItem(PROGRESS_KEY);
        if (!savedProgress) return;
        try {
            const progress = JSON.parse(savedProgress);
            if(progress.answers) {
                showToast('Seu progresso foi restaurado.', 'info');
                Object.entries(progress.answers).forEach(([q, a]) => {
                    const radio = qs(`input[name="${q}"][value="${a}"]`);
                    if (radio) radio.checked = true;
                });
            }
        } catch(e) { console.error("Falha ao restaurar progresso:", e); localStorage.removeItem(PROGRESS_KEY); }
    }

    // ==========================================================
    //              LÓGICA DE SUBMISSÃO E RESULTADO
    // ==========================================================

    async function handleQuizSubmit(event) {
        event.preventDefault();
        
        const submitBtn = qs('#submitBtn'),
              submitBtnText = qs('#submitBtnText'),
              submitBtnSpinner = qs('#submitBtnSpinner');

        let allAnswered = true;
        const studentAnswers = {};
        const fieldsets = qsa('fieldset[id^="q"]', quizForm);
        fieldsets.forEach(fs => {
            const sel = qs(`input[name="${fs.id}"]:checked`, fs);
            if (!sel) allAnswered = false;
            studentAnswers[fs.id] = sel ? sel.value : null;
        });

        if (!allAnswered) { return showToast('Por favor, responda todas as questões antes de enviar.', 'warn'); }

        submitBtn.disabled = true; submitBtnText.classList.add('hidden'); submitBtnSpinner.classList.remove('hidden');
        
        clearInterval(permissionCheckInterval);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);

        try {
            const { data, error } = await supabaseClient.rpc('corrigir_respostas_aluno', { exam_id: SERIES_ID, student_answers: studentAnswers });
            if (error) throw new Error(`Erro na API de correção: ${error.message}`);
            if (data.error) throw new Error(`Erro no servidor: ${data.error}`);
            
            const record = {
                correctCount: data.correctCount,
                totalQuestions: data.totalQuestions || fieldsets.length,
                finalAnswers: studentAnswers,
                finalized: true
            };
            
            localStorage.removeItem(PROGRESS_KEY);
            if (document.exitFullscreen) document.exitFullscreen();
            
            quizForm.style.display = 'none';
            showModalResultFinal(record);
        } catch (err) {
            console.error("Erro ao submeter prova:", err.message);
            showToast('Houve um erro ao corrigir sua prova. Tente novamente.', 'error');
            submitBtn.disabled = false; submitBtnText.classList.remove('hidden'); submitBtnSpinner.classList.add('hidden');
            startPermissionChecker();
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        }
    }
    
    function showModalResultFinal(record) {
        const total = record.totalQuestions;
        const pct = Math.round((record.correctCount / total) * 100);
        createModal(`<div class="text-center"><div class="check-wrap"><svg class="check-svg" viewBox="0 0 52 52"><path class="checkmark__path" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div><h2 class="text-2xl font-bold text-slate-900 mt-4">Avaliação Finalizada!</h2><p class="text-5xl font-bold text-slate-800 my-2"><span id="score-counter">${pct}</span>%</p><p class="text-sm text-gray-600">Acertos: ${record.correctCount} de ${total}</p><p class="mt-4 max-w-md mx-auto">Seu desempenho foi registrado. Clique abaixo para gerar e enviar seu resultado.</p><div id="confetti-container" class="confetti"></div><div class="mt-6"><button id="modalExport" class="w-full bg-indigo-600 text-white font-semibold py-3 px-5 rounded-lg transition hover:bg-indigo-700 active:scale-95">Enviar Resultado Final</button></div></div>`);
        qs('#modalExport')?.addEventListener('click', () => triggerExport(record));
    }
    
// Substitua sua função triggerExport inteiramente por esta versão final e corrigida.
function triggerExport(record) {
    const btn = qs('#modalExport');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> Gerando e enviando PDF...';
    }

    // A CORREÇÃO ESTÁ AQUI: Trocamos .eq('id', SERIES_ID) por .eq('serie', SERIES_ID)
    supabaseClient.from('gabaritos').select('gabarito_completo').eq('serie', SERIES_ID).single()
        .then(({ data, error }) => {
            if (error || !data) {
                throw new Error(error?.message || 'Gabarito oficial não encontrado para gerar o PDF.');
            }

            const GABARITO_OFICIAL = data.gabarito_completo || {};
            const respostasDoAluno = record.finalAnswers || {};
            const totalQuestoes = record.totalQuestions;

            const tableBody = [...Array(totalQuestoes).keys()].map(i => {
                const qKey = `q${i + 1}`;
                const respostaCorreta = GABARITO_OFICIAL[qKey];
                const respostaAluno = respostasDoAluno[qKey];
                const isCorrect = respostaAluno === respostaCorreta;

                return `<tr style="background-color:${isCorrect ? '#f0fff4' : '#fff5f5'};">
                    <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">${i + 1}</td>
                    <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">${respostaCorreta || '-'}</td>
                    <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">${respostaAluno || 'N/R'}</td>
                    <td style="padding: 8px; text-align: center; color:${isCorrect ? '#16a34a' : '#dc2626'}; font-weight: bold;">${isCorrect ? '✓' : '✗'}</td>
                </tr>`;
            }).join('');

            const safeStudentName = normalizeString(studentProfile.nome_completo);
            const mainFolder = `${normalizeString(examInfo.series)}_${normalizeString(examInfo.areaName)}`;
            const classFolder = `TURMA_${studentProfile.turma}`;
            const fileName = `${studentProfile.matricula}-${safeStudentName}.pdf`;
            const filePath = `${mainFolder}/${classFolder}/${fileName}`;
            
            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `<div style="font-family: Arial, sans-serif; padding: 40px; font-size: 12px; color: #333;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="font-size: 24px; margin: 0; color: #111;">Resultado Final da Avaliação</h2>
                    <p style="font-size: 16px; color: #555;">${examInfo.areaName || ''} - ${examInfo.series || ''}</p>
                </div>
                <div style="margin-bottom: 25px; padding: 15px; border: 1px solid #e9ecef; border-radius: 8px; background-color: #f8f9fa;">
                    <p style="margin: 4px 0;"><strong>Aluno:</strong> ${studentProfile.nome_completo}</p>
                    <p style="margin: 4px 0;"><strong>Matrícula:</strong> ${studentProfile.matricula}</p>
                    <p style="margin: 4px 0;"><strong>Turma:</strong> ${studentProfile.turma}</p>
                    <p style="margin: 4px 0;"><strong>Data de Finalização:</strong> ${dataHora}</p>
                </div>
                <div style="margin-bottom: 20px;">
                    <p style="font-size: 16px;"><strong>Pontuação Final:</strong> ${record.correctCount} de ${totalQuestoes} acertos (${Math.round((record.correctCount / totalQuestoes) * 100)}%)</p>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background-color:#e9ecef;">
                            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">Questão</th>
                            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">Gabarito</th>
                            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">Sua Resposta</th>
                            <th style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>${tableBody}</tbody>
                </table>
                <p style="margin-top: 30px; font-size: 10px; color: #999; text-align: center;">Documento gerado pelo Portal de Avaliações CEJA</p>
            </div>`;

            const opt = { margin: 0.5, filename: fileName, jsPDF: { unit: 'in', format: 'a4' }, html2canvas: { scale: 2 } };

            html2pdf().from(wrapper).output('blob').then(pdfBlob => {
                supabaseClient.storage.from('resultados-provas').upload(filePath, pdfBlob, { upsert: true })
                .then(({ data, error: uploadError }) => {
                    if (uploadError) throw uploadError;
                    showToast('Prova enviada com sucesso!', 'success');
                    if (btn) btn.textContent = "Enviado com Sucesso!";
                    setTimeout(() => window.close(), 2000);
                })
                .catch(err => {
                    console.error('Erro no envio para Supabase:', err);
                    showToast('Erro ao enviar. Baixando PDF localmente para segurança.', 'error');
                    if(btn) { btn.disabled = false; btn.textContent = "Tentar Enviar Novamente"; }
                    saveAs(pdfBlob, fileName);
                });
            });
        }).catch(err => {
            console.error("Erro crítico ao buscar gabarito para gerar o PDF:", err.message);
            showToast('Erro crítico ao preparar o resultado. Tente novamente.', 'error');
            if(btn) { btn.disabled = false; btn.textContent = "Tentar Gerar Novamente"; }
        });
}

    // ==========================================================
    //                        PONTO DE ENTRADA
    // ==========================================================

    if (quizForm && startFullscreenBtn && startExamOverlay) {
        setupQuizHeader();
        const imageFolder = quizForm.dataset.imageFolder;
        insertImagesAuto(imageFolder);
        restoreProgress();
        
        quizForm.addEventListener('change', saveProgress);
        quizForm.addEventListener('submit', handleQuizSubmit);

        startFullscreenBtn.addEventListener('click', () => {
            startExamOverlay.style.display = 'none';
            enterFullscreen();
            
            setupPagination(); // Ativa a paginação após o início

            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            startPermissionChecker();
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('keydown', e => { 
                if ((e.ctrlKey && (e.key === 'r' || e.key === 'R')) || e.key === 'F5' || (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I'))) {
                    e.preventDefault();
                }
            });
        });
    } else {
        console.error("Estrutura da prova incompleta.");
    }
})();