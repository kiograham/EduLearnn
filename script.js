// --- 1. IMPORT FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup,
    updatePassword,
    updateProfile,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    getDocs,
    deleteDoc,
    updateDoc,
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- 2. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyC39Su1_wd5ABicHJi0lE6iyjWi5tk-R68",
  authDomain: "edulearn-web-cd39d.firebaseapp.com",
  projectId: "edulearn-web-cd39d",
  storageBucket: "edulearn-web-cd39d.firebasestorage.app",
  messagingSenderId: "212737859534",
  appId: "1:212737859534:web:b24be31dfa09c253dc159f"
};

// KONFIGURASI CLOUDINARY
const CLOUD_NAME = "def71dwah"; 
const UPLOAD_PRESET = "xz4ef4oy"; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Variabel Global
let currentUserData = null;
let unsubscribeClasses = null;
let currentClassId = null;
let currentTaskId = null; // ID Tugas untuk Grading

// --- FUNGSI UPLOAD KE CLOUDINARY ---
async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Gagal upload ke Cloudinary");
        const data = await res.json();
        return data.secure_url;
    } catch (error) {
        console.error("Upload Error:", error); throw error;
    }
}

// --- 3. LISTENER UTAMA ---
onAuthStateChanged(auth, async (user) => {
    const loading = document.getElementById('loading-overlay');
    // Hapus timeout manual agar loading tidak tertutup sebelum data siap
    // setTimeout(() => { if(!loading.classList.contains('hidden')) loading.classList.add('hidden'); }, 8000);

    if (user) {
        loading.classList.remove('hidden');
        try {
            const docRef = doc(db, "users", user.email);
            let docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                await setDoc(docRef, {
                    name: user.displayName || "User Baru",
                    role: 'student', 
                    email: user.email,
                    createdAt: new Date().toISOString()
                });
                docSnap = await getDoc(docRef);
            }

            currentUserData = docSnap.data();
            
            document.getElementById('login-page').classList.add('hidden');
            document.getElementById('main-navbar').style.display = 'flex';
            document.getElementById('main-container').style.display = 'block'; 
            
      // --- KODE BARU: CEK APAKAH PUNYA FOTO? ---
const navAvatar = document.getElementById('nav-avatar');

if (currentUserData.photoUrl) {
    // Jika punya foto, TAMPILKAN FOTO
    navAvatar.innerHTML = `<img src="${currentUserData.photoUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
} else {
    // Jika tidak punya, baru tampilkan INISIAL HURUF
    const initials = currentUserData.name ? currentUserData.name.substring(0,2).toUpperCase() : "UR";
    navAvatar.textContent = initials;
    navAvatar.innerHTML = initials; // Reset isi html agar tidak numpuk
}
            document.getElementById('dropdown-name').textContent = currentUserData.name;
            document.getElementById('dropdown-role').textContent = currentUserData.role === 'teacher' ? 'Guru' : 'Mahasiswa';
            
            updateUIByRole();
            loadClassesRealtime();
            loadJadwalHariIni(); // FITUR BARU

        } catch (error) {
            console.error("Login Error:", error);
            alert("Error: " + error.message);
        } finally {
            loading.classList.add('hidden');
        }
    } else {
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('main-navbar').style.display = 'none';
        document.getElementById('main-container').style.display = 'none';
        if(unsubscribeClasses) unsubscribeClasses();
        loading.classList.add('hidden');
    }
});

// --- 4. UPDATE UI SESUAI ROLE ---
function updateUIByRole() {
    // 1. Tombol di Dashboard
    const btnDash = document.getElementById('btn-class-action');
    // 2. Tombol di Halaman Kelas Saya (BARU)
    const btnPage = document.getElementById('btn-class-action-page'); 
    
    if (currentUserData.role === 'teacher') {
        // Setting untuk Guru
        const setGuruBtn = (btn) => {
            if(btn) {
                btn.textContent = "+ Buat Kelas Baru";
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-success');
                btn.onclick = () => document.getElementById('create-class-modal').classList.remove('hidden');
            }
        };
        setGuruBtn(btnDash);
        setGuruBtn(btnPage);

    } else {
        // Setting untuk Siswa
        const setSiswaBtn = (btn) => {
            if(btn) {
                btn.textContent = "+ Join Kelas Baru";
                btn.classList.add('btn-primary');
                btn.classList.remove('btn-success');
                btn.onclick = () => document.getElementById('join-class-modal').classList.remove('hidden');
            }
        };
        setSiswaBtn(btnDash);
        setSiswaBtn(btnPage);
    }
}

// --- 5. LOGIKA JADWAL (BARU) ---
function loadJadwalHariIni() {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const today = days[new Date().getDay()];
    document.getElementById('today-name').textContent = today;
    const container = document.getElementById('today-schedule-list');

    setTimeout(() => {
        container.innerHTML = "";
        
        if (currentUserData.role === 'teacher') {
            const q = query(collection(db, "classes"), where("teacherEmail", "==", auth.currentUser.email), where("scheduleDay", "==", today));
            getDocs(q).then((snapshot) => {
                if(snapshot.empty) container.innerHTML = `<p class="text-muted">Tidak ada jadwal mengajar hari ini.</p>`;
                else {
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        container.innerHTML += `
                            <div class="activity-item" onclick="showClassDetail('${doc.id}')">
                                <div><strong>${data.title}</strong><br><span class="text-muted">Jam: ${data.scheduleTime || '-'}</span></div>
                                <span class="badge badge-pending">Masuk</span>
                            </div>`;
                    });
                }
            });
        } else {
            // Logic Siswa (Filter Client-side Sederhana)
            const cards = document.querySelectorAll('.class-card');
            let hasSchedule = false;
            // Ini asumsi sederhana: di sistem nyata butuh query kompleks
            if(cards.length === 0) {
                container.innerHTML = `<p class="text-muted">Tidak ada jadwal.</p>`;
            } else {
                container.innerHTML = `<p class="text-muted">Cek daftar kelas di bawah untuk melihat jadwal.</p>`;
            }
        }
    }, 1500);
}

// --- 6. LOAD KELAS ---
function loadClassesRealtime() {

    async function updateTaskStatistics() {
    if (!auth.currentUser) return;
    
    const myEmail = auth.currentUser.email;
    
    try {
        // Query semua submission milik user ini
        const q = query(
            collection(db, "submissions"), 
            where("studentEmail", "==", myEmail)
        );
        
        const snapshot = await getDocs(q);
        
        let taskDone = 0;
        let taskPending = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Kalau sudah ada nilai = selesai
            if (data.score && data.score > 0) {
                taskDone++;
            } else {
                taskPending++;
            }
        });
        
        // Update dashboard dengan animasi
        updateStatCard('stat-task-done', 'progress-done', taskDone, 20);
        updateStatCard('stat-task-pending', 'progress-pending', taskPending, 10);
        updateUrgentBadge(taskPending);
        
    } catch (error) {
        console.error("Error updating task stats:", error);
        // Fallback: set ke 0
        updateStatCard('stat-task-done', 'progress-done', 0, 20);
        updateStatCard('stat-task-pending', 'progress-pending', 0, 10);
    }
}



    const container = document.getElementById('classes-container');
    const statTotal = document.getElementById('stat-total-class');
    const myEmail = auth.currentUser.email; 
    if (unsubscribeClasses) unsubscribeClasses();

    if (currentUserData.role === 'teacher') {
        const q = query(collection(db, "classes"), where("teacherEmail", "==", myEmail));
        unsubscribeClasses = onSnapshot(q, (snapshot) => {
            if(statTotal) {updateStatCard('stat-total-class', 'progress-class', snapshot.size, 10);}
            renderClassesList(snapshot.docs, container);
        });
    } else {
        const qMember = query(collection(db, "class_members"), where("studentEmail", "==", myEmail));
        unsubscribeClasses = onSnapshot(qMember, async (snapshot) => {
            if (snapshot.empty) { 
                if(statTotal) statTotal.textContent = "0";
                container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #94a3b8;">Belum bergabung di kelas manapun.</p>`; 
                return; 
            }
            const classPromises = snapshot.docs.map(async (memberDoc) => {
                const classId = memberDoc.data().classId;
                return getDoc(doc(db, "classes", classId));
            });
            const classDocs = await Promise.all(classPromises);
            const validClassDocs = classDocs.filter(doc => doc.exists());
            
            if(statTotal) statTotal.textContent = validClassDocs.length;
            if(validClassDocs.length > 0) validClassDocs.forEach(doc => renderSingleClassCard(doc, container));
            else container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #94a3b8;">Kelas tidak ditemukan.</p>`;
        });
    }
}

function renderClassesList(docs, container) {
    container.innerHTML = "";
    docs.forEach(doc => { renderSingleClassCard(doc, container); });
}

function renderSingleClassCard(doc, container) {
    const data = doc.data();
    const colors = ['blue', 'green', 'orange']; 
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const isOwner = (auth.currentUser.email === data.teacherEmail);
    
    // Tombol untuk Guru (Hapus Kelas) atau Siswa (Keluar Kelas)
    let actionBtn = '';
    if (isOwner) {
        actionBtn = `<button onclick="deleteClass(event, '${doc.id}')" title="Hapus Kelas" style="position:absolute; top:15px; right:15px; background:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.1); font-size:0.8rem; z-index:10;">🗑️</button>`;
    } else {
        actionBtn = `<button onclick="leaveClass(event, '${doc.id}')" title="Keluar dari Kelas" style="position:absolute; top:15px; right:15px; background:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.1); font-size:0.8rem; z-index:10; color:#dc2626;">🚪</button>`;
    }

    const html = `
        <div class="class-card" onclick="showClassDetail('${doc.id}')" style="position: relative;">
            ${actionBtn}
            <div class="class-banner ${randomColor}">${data.title ? data.title.charAt(0).toUpperCase() : '?'}</div>
            <div class="class-info">
                <div class="class-title">${data.title || 'Tanpa Nama'}</div>
                <div class="class-meta">${data.scheduleDay || '-'} • ${data.scheduleTime || '-'}</div>
                <div class="class-meta" style="font-size:0.75rem; margin-top:5px;">👨‍🏫 ${data.teacherName || 'Guru'}</div>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

// --- 7. LOGIKA DETAIL KELAS & TAB ---
window.showClassDetail = async function(classId) {
    currentClassId = classId;
    document.getElementById('loading-overlay').classList.remove('hidden');

    try {
        const classRef = doc(db, "classes", classId);
        const classSnap = await getDoc(classRef);

        if (classSnap.exists()) {
            const data = classSnap.data();
            document.getElementById('detail-class-title').textContent = data.title;
            document.getElementById('detail-class-info').textContent = `Kode: ${data.code || 'Tanpa Kode'} • Guru: ${data.teacherName}`;

            const isGuru = (currentUserData.role === 'teacher');
            const btnMateri = document.getElementById('btn-add-materi');
            const btnTugas = document.getElementById('btn-add-tugas');
            
            // Logika Tombol Materi & Tugas (LAMA)
            if(btnMateri) { 
                btnMateri.style.display = isGuru ? 'block' : 'none'; 
                btnMateri.onclick = () => document.getElementById('modal-add-materi').classList.remove('hidden'); 
            }
            if(btnTugas) { 
                btnTugas.style.display = isGuru ? 'block' : 'none'; 
                btnTugas.onclick = () => document.getElementById('modal-add-tugas').classList.remove('hidden'); 
            }

            // 👇👇👇 TEMPEL KODE BARU DI SINI (LOGIKA TOMBOL KUIS) 👇👇👇
            const btnQuiz = document.getElementById('btn-add-quiz');
            if(btnQuiz) {
                // Tampilkan tombol hanya jika Guru
                btnQuiz.style.display = isGuru ? 'inline-block' : 'none';
                
                // Saat tombol diklik, buka modal dan reset form soal
                btnQuiz.onclick = () => {
                    document.getElementById('modal-create-quiz').classList.remove('hidden');
                    document.getElementById('questions-container').innerHTML = ''; // Kosongkan soal lama
                    addQuestionField(); // Tambahkan 1 kolom soal otomatis
                };
            }
            // 👆👆👆 SELESAI KODE BARU 👆👆👆

            document.getElementById('dashboard-page').classList.add('hidden');
            document.getElementById('class-detail-page').classList.remove('hidden');
            window.switchTab('materi');
        } else { 
            alert("Kelas tidak ditemukan!"); 
        }
    } catch (e) { 
        console.error(e); 
        alert("Gagal memuat kelas."); 
    } finally { 
        document.getElementById('loading-overlay').classList.add('hidden'); 
    }
};

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    
    // Highlight Tab
    const tabs = document.querySelectorAll('.tab-item');
    if(tabName === 'materi') tabs[0].classList.add('active');
    if(tabName === 'tugas') tabs[1].classList.add('active');
    if(tabName === 'nilai') tabs[2].classList.add('active'); // NEW TAB
    if(tabName === 'absensi') tabs[3].classList.add('active');
    if(tabName === 'anggota') tabs[4].classList.add('active');

    if(tabName === 'materi') loadMateriRealtime();
    if(tabName === 'tugas') loadTugasRealtime();
    if(tabName === 'nilai') {
    loadNilaiRekap(); // ✅ AKTIFKAN KEMBALI
    }
    if(tabName === 'absensi') loadAbsensiRealtime();
    if(tabName === 'anggota') loadAnggotaRealtime();
};


// =========================================
//    LOGIKA MATERI BARU (LINK & DOKUMEN)
// =========================================

let currentMateriType = 'link'; // Default: link

// Switch antara tipe Link dan Dokumen
window.switchMateriType = (type) => {
    currentMateriType = type;
    
    const btnLink = document.getElementById('btn-materi-link');
    const btnDoc = document.getElementById('btn-materi-doc');
    const linkArea = document.getElementById('materi-link-area');
    const docArea = document.getElementById('materi-doc-area');
    
    if (type === 'link') {
        btnLink.classList.remove('btn-secondary');
        btnLink.classList.add('btn-primary');
        btnDoc.classList.remove('btn-primary');
        btnDoc.classList.add('btn-secondary');
        
        linkArea.classList.remove('hidden');
        docArea.classList.add('hidden');
    } else {
        btnDoc.classList.remove('btn-secondary');
        btnDoc.classList.add('btn-primary');
        btnLink.classList.remove('btn-primary');
        btnLink.classList.add('btn-secondary');
        
        linkArea.classList.add('hidden');
        docArea.classList.remove('hidden');
    }
};

// Fungsi Simpan Materi yang baru 
window.saveMateri = async function() {
    const title = document.getElementById('materi-title').value.trim();
    
    if (!title) {
        return alert("Judul materi wajib diisi!");
    }
    
    const btn = document.getElementById('btn-submit-materi');
    btn.textContent = "Menyimpan...";
    btn.disabled = true;
    
    try {
        let materiData = {
            classId: currentClassId,
            title: title,
            type: currentMateriType, // 'link' atau 'document'
            createdAt: new Date().toISOString(),
            teacherName: currentUserData.name
        };
        
        if (currentMateriType === 'link') {
            // Tipe Link
            const link = document.getElementById('materi-link').value.trim();
            if (!link) {
                alert("Link wajib diisi!");
                btn.textContent = "Posting Materi";
                btn.disabled = false;
                return;
            }
            materiData.link = link;
            
        } else {
            // Tipe Dokumen
            const content = document.getElementById('materi-content').value.trim();
            if (!content) {
                alert("Isi materi wajib diisi!");
                btn.textContent = "Posting Materi";
                btn.disabled = false;
                return;
            }
            materiData.content = content;
            
            // Upload file pendukung (opsional)
            const fileInput = document.getElementById('materi-file');
            if (fileInput && fileInput.files[0]) {
                btn.textContent = "Mengupload file...";
                const fileUrl = await uploadToCloudinary(fileInput.files[0]);
                materiData.attachmentUrl = fileUrl;
            }
        }
        
        await addDoc(collection(db, "materials"), materiData);
        
        alert("✅ Materi berhasil diposting!");
        document.getElementById('modal-add-materi').classList.add('hidden');
        
        // Reset form
        document.getElementById('materi-title').value = '';
        document.getElementById('materi-link').value = '';
        document.getElementById('materi-content').value = '';
        const fileInput = document.getElementById('materi-file');
        if (fileInput) fileInput.value = '';
        
    } catch (error) {
        console.error(error);
        alert("Gagal posting materi: " + error.message);
    } finally {
        btn.textContent = "Posting Materi";
        btn.disabled = false;
    }
}

function loadMateriRealtime() {
    const q = query(collection(db, "materials"), where("classId", "==", currentClassId));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('materi-list');
        container.innerHTML = "";
        if(snapshot.empty) { 
            container.innerHTML = `<p class="text-muted">Belum ada materi.</p>`; 
            return; 
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const isGuru = (currentUserData.role === 'teacher');
            
            // Tombol hapus
            const deleteBtn = isGuru ? 
                `<button onclick="deleteMateri(event, '${doc.id}')" 
                         class="btn btn-secondary" 
                         style="padding:5px 10px; font-size:0.8rem; background:#fee2e2; color:#dc2626;">
                    🗑️ Hapus
                </button>` : '';
            
            // Bedakan tampilan berdasarkan tipe
            if (data.type === 'link') {
                // Materi tipe Link
                container.innerHTML += `
                    <div class="activity-item" onclick="window.open('${data.link}', '_blank')" style="cursor:pointer;">
                        <div style="display:flex; gap:15px; align-items:center; flex:1;">
                            <div style="background:#e0f2fe; padding:10px; border-radius:8px; font-size:1.5rem;">🔗</div>
                            <div>
                                <div class="activity-title">${data.title}</div>
                                <div class="activity-subtitle" style="color:#2563eb; font-size:0.8rem;">Link Eksternal • Klik untuk buka</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            ${deleteBtn}
                            <span class="badge badge-pending">Buka</span>
                        </div>
                    </div>
                `;
            } else {
                // Materi tipe Dokumen
                const preview = data.content ? data.content.substring(0, 80) + '...' : '';
                const hasAttachment = data.attachmentUrl ? '📎' : '';
                
                container.innerHTML += `
                    <div class="activity-item" onclick="viewMateriDocument('${doc.id}')" style="cursor:pointer;">
                        <div style="display:flex; gap:15px; align-items:center; flex:1;">
                            <div style="background:#dcfce7; padding:10px; border-radius:8px; font-size:1.5rem;">📄</div>
                            <div>
                                <div class="activity-title">${data.title} ${hasAttachment}</div>
                                <div class="activity-subtitle" style="font-size:0.8rem;">${preview}</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            ${deleteBtn}
                            <span class="badge" style="background:#059669; color:white;">Baca</span>
                        </div>
                    </div>
                `;
            }
        });
    });
}

// Fungsi untuk buka dokumen materi
window.viewMateriDocument = async (materiId) => {
    const docSnap = await getDoc(doc(db, "materials", materiId));
    if (!docSnap.exists()) return alert("Materi tidak ditemukan!");
    
    const data = docSnap.data();
    
    // Buat modal preview
    const attachmentLink = data.attachmentUrl ? 
        `<a href="${data.attachmentUrl}" target="_blank" class="btn btn-secondary" style="margin-top:15px;">
            📎 Download File Lampiran
        </a>` : '';
    
    const modalHTML = `
        <div class="fullscreen-overlay" id="view-materi-modal" style="z-index:10000;">
            <div class="modal-card" style="max-width:800px; max-height:90vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 class="modal-title" style="margin:0;">${data.title}</h2>
                    <button onclick="document.getElementById('view-materi-modal').remove()" 
                            style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#64748b;">✕</button>
                </div>
                
                <div style="background:#f8fafc; padding:20px; border-radius:12px; white-space:pre-wrap; line-height:1.8; font-size:0.95rem;">
${data.content}
                </div>
                
                ${attachmentLink}
                
                <button onclick="document.getElementById('view-materi-modal').remove()" 
                        class="btn btn-secondary full-width" style="margin-top:20px;">
                    Tutup
                </button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// --- B. TUGAS (DENGAN UPLOAD FILE GURU) ---
window.saveTugas = async function() {
    const title = document.getElementById('tugas-title').value;
    const deadline = document.getElementById('tugas-deadline').value;
    const desc = document.getElementById('tugas-desc').value;
    // Ambil input file guru (sesuai ID di HTML: tugas-file)
    const fileIn = document.getElementById('tugas-file');
    
    if(!title || !deadline) return alert("Judul dan Deadline wajib diisi!");
    
    const btn = document.getElementById('btn-submit-tugas');
    btn.textContent = "Mengupload..."; btn.disabled = true;

    try {
        let attachUrl = "";
        // Jika guru memilih file, upload ke Cloudinary
        if(fileIn && fileIn.files[0]) {
            attachUrl = await uploadToCloudinary(fileIn.files[0]);
        }

        await addDoc(collection(db, "assignments"), { 
            classId: currentClassId, 
            title: title, 
            deadline: deadline, 
            description: desc, 
            attachment: attachUrl, // Simpan URL file soal
            createdAt: new Date().toISOString() 
        });
        
        alert("Tugas berhasil dibuat!");
        document.getElementById('modal-add-tugas').classList.add('hidden');
        document.getElementById('tugas-title').value = '';
        document.getElementById('tugas-desc').value = '';
        if(fileIn) fileIn.value = ''; // Reset input file
    } catch(e) { alert("Error: " + e.message); } 
    finally { btn.textContent = "Posting Tugas"; btn.disabled = false; }
}

// =========================================
// BAGIAN C: LOAD DAFTAR TUGAS & KUIS (VERSI BARU)
// =========================================

function loadTugasRealtime() {
    const container = document.getElementById('tugas-list');
    const isGuru = (currentUserData.role === 'teacher');
    
    const qAssignments = query(collection(db, "assignments"), where("classId", "==", currentClassId));

    onSnapshot(qAssignments, (snapAssignments) => {
        container.innerHTML = "";
        
        // Render Tugas Biasa
        snapAssignments.forEach(doc => {
            const data = doc.data();
            
            const deleteBtn = isGuru ? 
                `<button onclick="deleteTugas(event, '${doc.id}')" 
                         style="padding:5px 10px; font-size:0.75rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; cursor:pointer; margin-left:8px;">
                    🗑️
                </button>` : '';
            
            container.innerHTML += `
            <div class="activity-item" onclick="openTaskDetail('${doc.id}')" style="cursor:pointer;">
                <div style="display:flex; gap:15px; align-items:center; flex:1;">
                    <div style="background:#ffedd5; padding:10px; border-radius:8px; font-size:1.5rem;">📝</div>
                    <div>
                        <div class="activity-title">${data.title}</div>
                        <div class="activity-subtitle">Tugas Upload File • Deadline: ${data.deadline || '-'}</div>
                    </div>
                </div>
                ${deleteBtn}
            </div>`;
        });

        // Render Kuis
        const qQuizzes = query(collection(db, "quizzes"), where("classId", "==", currentClassId));

        onSnapshot(qQuizzes, (snapQuizzes) => {
            snapQuizzes.forEach(doc => {
                const data = doc.data();
                
                const deleteBtn = isGuru ? 
                    `<button onclick="deleteQuiz(event, '${doc.id}')" 
                             style="padding:5px 10px; font-size:0.75rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; cursor:pointer; margin-left:8px;">
                        🗑️
                    </button>` : '';
                
                container.innerHTML += `
                <div class="activity-item" onclick="startQuiz('${doc.id}')" style="cursor:pointer;">
                    <div style="display:flex; gap:15px; align-items:center; flex:1;">
                        <div style="background:#ddd6fe; padding:10px; border-radius:8px; font-size:1.5rem;">🧠</div>
                        <div>
                            <div class="activity-title">${data.title}</div>
                            <div class="activity-subtitle">Kuis Pilihan Ganda</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <span class="badge" style="background:#8b5cf6; color:white;">Mulai Kuis</span>
                        ${deleteBtn}
                    </div>
                </div>`;
            });

            if(snapAssignments.empty && snapQuizzes.empty) {
                container.innerHTML = `<p class="text-muted">Belum ada tugas atau kuis saat ini.</p>`;
            }
        });
    });
}

// --- FITUR BARU: DETAIL TUGAS & GRADING ---
window.openTaskDetail = async (taskId) => {
    currentTaskId = taskId;
    const snap = await getDoc(doc(db, "assignments", taskId));
    const data = snap.data();
    
    document.getElementById('sub-task-title').textContent = data.title;
    document.getElementById('sub-task-desc').textContent = data.description || "Tidak ada instruksi.";
    
    // Tampilkan Link Soal Guru (Jika ada)
    const attachDiv = document.getElementById('task-attachment-container');
    const attachLink = document.getElementById('task-attachment-link');
    if(data.attachment) {
        attachDiv.classList.remove('hidden');
        attachLink.href = data.attachment;
    } else {
        attachDiv.classList.add('hidden');
    }

    // Ganti View
    document.getElementById('class-detail-page').classList.add('hidden');
    document.getElementById('assignment-detail-page').classList.remove('hidden');

    const isGuru = currentUserData.role === 'teacher';
    document.getElementById('student-upload-area').classList.toggle('hidden', isGuru);
    document.getElementById('teacher-grading-area').classList.toggle('hidden', !isGuru);

    if(isGuru) {
        // GURU: Load Submission
        const qSub = query(collection(db, "submissions"), where("taskId", "==", taskId));
        onSnapshot(qSub, snapSub => {
            const list = document.getElementById('submission-list');
            list.innerHTML = "";
            if(snapSub.empty) { 
                list.innerHTML = "<p class='text-muted'>Belum ada yang mengumpulkan.</p>"; 
                return; 
            }
            
            snapSub.forEach(s => {
                const sub = s.data();
                
                // Cek apakah ada multiple files (dipisah koma)
                const fileUrls = sub.fileUrl ? sub.fileUrl.split(',') : [];
                const fileCount = sub.fileCount || fileUrls.length;
                
                // Buat link untuk setiap file
                let fileLinks = '';
                if (fileUrls.length > 0) {
                    fileUrls.forEach((url, idx) => {
                        fileLinks += `
                            <a href="${url.trim()}" target="_blank" class="badge" 
                               style="background:#3b82f6; color:white; text-decoration:none; margin-right:5px; margin-bottom:3px; display:inline-block;">
                                📄 File ${idx + 1}
                            </a>
                        `;
                    });
                }
                
                const scoreHTML = sub.score 
                    ? `<b style="color:green;">Nilai: ${sub.score}</b>` 
                    : `<button onclick="openGradingModal('${s.id}', '${sub.studentName}')" 
                               class="badge badge-pending" style="cursor:pointer;">Beri Nilai</button>`;
                
                list.innerHTML += `
                    <div class="activity-item" style="cursor:default;">
                        <div>
                            <b>${sub.studentName}</b>
                            <br>
                            <small style="color:#64748b;">
                                ${fileCount > 1 ? `Mengumpulkan ${fileCount} file` : 'Mengumpulkan'}
                            </small>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                            ${fileLinks}
                            ${scoreHTML}
                        </div>
                    </div>
                `;
            });
        });
    } else {
        // SISWA: Cek Submission Sendiri
        const subId = `${taskId}_${auth.currentUser.email}`;
        getDoc(doc(db, "submissions", subId)).then(s => {
            if(s.exists()) {
                const myData = s.data();
                document.getElementById('upload-status-text').textContent = "✅ Tugas Sudah Dikumpulkan";
                if(myData.score) {
                    document.getElementById('student-grade-display').classList.remove('hidden');
                    document.getElementById('my-score').textContent = myData.score;
                }
            } else {
                // Reset jika belum ada
                document.getElementById('upload-status-text').textContent = "📄 Klik untuk upload file (bisa lebih dari 1)";
                document.getElementById('student-grade-display').classList.add('hidden');
            }
        });
    }
};

window.openGradingModal = (subId, name) => {
    document.getElementById('modal-grading').classList.remove('hidden');
    document.getElementById('grade-student-name').textContent = "Siswa: " + name;
    
    document.getElementById('btn-submit-grade').onclick = async () => {
        const score = document.getElementById('grade-input').value;
        await updateDoc(doc(db, "submissions", subId), { score: score });
        alert("Nilai Berhasil Disimpan!");
        document.getElementById('modal-grading').classList.add('hidden');
    };
};

// =========================================
//       MULTI-FILE UPLOAD (SISWA)
// =========================================

let selectedFiles = []; // Array untuk menyimpan file yang dipilih

// Fungsi untuk Handle Multi-File Selection
window.handleMultiFileUpload = (input) => {
    const files = Array.from(input.files); // Konversi FileList jadi Array
    
    if (files.length === 0) return;
    
    selectedFiles = files; // Simpan ke variabel global
    
    // Tampilkan Preview
    const previewContainer = document.getElementById('file-preview-container');
    const fileListDiv = document.getElementById('file-list');
    
    previewContainer.style.display = 'block';
    fileListDiv.innerHTML = ''; // Bersihkan preview lama
    
    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.style.cssText = `
            padding: 10px; 
            background: #f1f5f9; 
            border-radius: 8px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            border: 1px solid #e2e8f0;
        `;
        
        fileItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.5rem;">${file.type.includes('image') ? '🖼️' : '📄'}</span>
                <div>
                    <div style="font-weight: 600; font-size: 0.9rem;">${file.name}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${(file.size / 1024).toFixed(1)} KB</div>
                </div>
            </div>
            <button onclick="removeFile(${index})" class="btn btn-secondary" 
                    style="padding: 5px 10px; font-size: 0.8rem;">
                ✕ Hapus
            </button>
        `;
        
        fileListDiv.appendChild(fileItem);
    });
    
    // Update Status Text
    document.getElementById('upload-status-text').textContent = 
        `✅ ${files.length} file dipilih (Klik lagi untuk ganti)`;
};

// Fungsi untuk Hapus File dari Preview
window.removeFile = (index) => {
    selectedFiles.splice(index, 1); // Hapus dari array
    
    // Update Preview
    const input = document.getElementById('student-file-upload');
    const dt = new DataTransfer();
    selectedFiles.forEach(file => dt.items.add(file));
    input.files = dt.files;
    
    // Refresh Preview
    handleMultiFileUpload(input);
    
    // Jika sudah kosong semua
    if (selectedFiles.length === 0) {
        document.getElementById('file-preview-container').style.display = 'none';
        document.getElementById('upload-status-text').textContent = 
            '📄 Klik untuk upload file (bisa lebih dari 1)';
    }
};

// Fungsi untuk Submit Multi-File
window.submitMultipleAssignments = async () => {
    if (selectedFiles.length === 0) {
        return alert("Pilih minimal 1 file jawaban!");
    }
    
    const btn = document.querySelector('#student-upload-area button.btn-primary');
    btn.textContent = `Mengupload ${selectedFiles.length} file...`;
    btn.disabled = true;

    try {
        // Upload semua file ke Cloudinary
        const uploadPromises = selectedFiles.map(file => uploadToCloudinary(file));
        const uploadedUrls = await Promise.all(uploadPromises);
        
        // Gabungkan semua URL jadi satu string (dipisah koma)
        const allFilesUrl = uploadedUrls.join(',');
        
        // Simpan ke Firestore
        const subId = `${currentTaskId}_${auth.currentUser.email}`;
        await setDoc(doc(db, "submissions", subId), {
            taskId: currentTaskId,
            classId: currentClassId,
            studentName: currentUserData.name,
            studentEmail: auth.currentUser.email,
            fileUrl: allFilesUrl, // Simpan semua URL
            fileCount: selectedFiles.length, // Jumlah file
            timestamp: new Date().toISOString()
        });
        
        alert(`✅ Berhasil! ${selectedFiles.length} file terkirim.`);
        
        // Reset
        selectedFiles = [];
        document.getElementById('student-file-upload').value = '';
        document.getElementById('file-preview-container').style.display = 'none';
        document.getElementById('upload-status-text').textContent = '✅ Tugas Sudah Dikumpulkan';
        
    } catch (e) {
        alert("Gagal upload: " + e.message);
    } finally {
        btn.textContent = "Kirim Semua File";
        btn.disabled = false;
    }
};

// BACKWARD COMPATIBILITY (Untuk fungsi lama yang masih dipanggil)
window.handleFileUpload = handleMultiFileUpload;
window.submitAssignment = submitMultipleAssignments;

window.submitAssignment = async () => {
    // ID input di HTML Anda adalah 'student-file-upload'
    const fileInput = document.getElementById('student-file-upload'); 
    
    if(!fileInput || !fileInput.files[0]) return alert("Pilih file jawaban dulu!");
    
    const btn = document.querySelector('#student-upload-area button');
    btn.textContent = "Mengupload..."; btn.disabled = true;

    try {
        const url = await uploadToCloudinary(fileInput.files[0]);
        const subId = `${currentTaskId}_${auth.currentUser.email}`;
        await setDoc(doc(db, "submissions", subId), {
            taskId: currentTaskId, classId: currentClassId, studentName: currentUserData.name, studentEmail: auth.currentUser.email,
            fileUrl: url, timestamp: new Date().toISOString()
        });
        alert("Tugas Terkirim!");
    } catch(e) { alert("Gagal: " + e.message); } 
    finally { btn.textContent = "Kirim Tugas"; btn.disabled = false; }
};

window.backToClass = () => {
    document.getElementById('assignment-detail-page').classList.add('hidden');
    document.getElementById('class-detail-page').classList.remove('hidden');
};

// =========================================
// UPDATE FUNGSI INI DI SCRIPT.JS
// =========================================

function loadNilaiRekap() {
    const container = document.getElementById('nilai-list');
    if(!container) return;

    container.innerHTML = "<p class='text-muted'>⏳ Menghitung peringkat...</p>";
    
    // Ambil submissions dari kelas ini
    const q = query(
        collection(db, "submissions"), 
        where("classId", "==", currentClassId)
    );
    
    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        
        if(snapshot.empty) { 
            container.innerHTML = `
                <div style="text-align:center; padding:3rem; color:#94a3b8;">
                    <div style="font-size:3rem; margin-bottom:1rem;">📊</div>
                    <p style="font-size:1.1rem; font-weight:600; color:#64748b;">Belum Ada Data Nilai</p>
                    <p style="font-size:0.9rem; margin-top:0.5rem;">Nilai akan muncul setelah siswa mengumpulkan tugas/kuis.</p>
                </div>
            `; 
            return; 
        }

        // 1. Hitung Total Skor per Siswa
        const studentScores = {}; 

        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.studentName || "Tanpa Nama";
            const score = parseInt(data.score) || 0; 

            if (!studentScores[name]) {
                studentScores[name] = 0;
            }
            studentScores[name] += score;
        });

        // 2. Urutkan Ranking
        const sortedStudents = Object.keys(studentScores)
            .map(name => ({ name, total: studentScores[name] }))
            .sort((a, b) => b.total - a.total);

        // 3. Render Leaderboard
        container.innerHTML = `
            <div style="margin-bottom:20px; padding:15px; background:linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius:12px; color:white; text-align:center;">
                <h3 style="margin:0; font-size:1.3rem;">🏆 Peringkat Kelas</h3>
                <p style="margin:5px 0 0; font-size:0.85rem; opacity:0.9;">Total ${sortedStudents.length} Siswa</p>
            </div>
        `;

        sortedStudents.forEach((student, index) => {
            const rank = index + 1;
            let rankClass = "";
            let trophy = "";

            if (rank === 1) { rankClass = "rank-1"; trophy = "👑"; }
            else if (rank === 2) { rankClass = "rank-2"; trophy = "🥈"; }
            else if (rank === 3) { rankClass = "rank-3"; trophy = "🥉"; }

            // Highlight jika ini saya sendiri
            const isMe = (currentUserData && student.name === currentUserData.name);
            const borderStyle = isMe ? "border-left: 5px solid #4f46e5;" : "";
            const bgStyle = isMe ? "background-color: #f0f9ff;" : "";

            const html = `
            <div class="rank-card" style="${borderStyle} ${bgStyle}">
                <div class="rank-info">
                    <div class="rank-number ${rankClass}">${rank}</div>
                    <div>
                        <div style="font-weight:bold; color:#1e293b; font-size:1rem;">
                            ${student.name} ${trophy} ${isMe ? '<span style="color:#4f46e5; font-size:0.8rem;">(Anda)</span>' : ''}
                        </div>
                        <div class="text-muted" style="font-size:0.8rem;">Total Akumulasi Nilai</div>
                    </div>
                </div>
                <div class="total-score">${student.total} <span style="font-size:0.8rem; color:#94a3b8;">Pts</span></div>
            </div>`;
            
            container.insertAdjacentHTML('beforeend', html);
        });
    });
}

// --- D. ABSENSI ---
function loadAbsensiRealtime() {
    if(!currentClassId) return;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('absensi-date').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

    const isGuru = currentUserData.role === 'teacher';
    document.getElementById('student-attendance-area').classList.toggle('hidden', isGuru);
    document.getElementById('teacher-attendance-area').classList.toggle('hidden', !isGuru);

    if (isGuru) {
        const q = query(collection(db, "attendance"), where("classId", "==", currentClassId), where("dateKey", "==", today));
        onSnapshot(q, (snapshot) => {
            const listContainer = document.getElementById('attendance-list');
            listContainer.innerHTML = "";
            if(snapshot.empty) { listContainer.innerHTML = `<p class="text-muted">Belum ada siswa yang absen hari ini.</p>`; return; }
            snapshot.forEach(doc => {
                const data = doc.data();
                const time = new Date(data.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                listContainer.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;"><span>${data.studentName}</span><span style="font-family:monospace; background:#d1fae5; padding:2px 6px; border-radius:4px;">Hadir ${time}</span></div>`;
            });
        });
    } else {
        const docId = `${currentClassId}_${today}_${auth.currentUser.email}`;
        getDoc(doc(db, "attendance", docId)).then((docSnap) => {
            if (docSnap.exists()) {
                document.getElementById('btn-submit-absensi').classList.add('hidden');
                document.getElementById('msg-already-present').classList.remove('hidden');
            } else {
                document.getElementById('btn-submit-absensi').classList.remove('hidden');
                document.getElementById('msg-already-present').classList.add('hidden');
                document.getElementById('btn-submit-absensi').onclick = () => submitAbsensi(docId, today);
            }
        });
    }
}

async function submitAbsensi(docId, dateKey) {
    const btn = document.getElementById('btn-submit-absensi');
    btn.textContent = "Memproses...";
    btn.disabled = true;
    try {
        await setDoc(doc(db, "attendance", docId), {
            classId: currentClassId, dateKey: dateKey, studentName: currentUserData.name, studentEmail: auth.currentUser.email, timestamp: new Date().toISOString(), status: 'Hadir'
        });
        alert("Berhasil! Kehadiran tercatat.");
        loadAbsensiRealtime();
    } catch (e) { alert("Gagal absen: " + e.message); btn.textContent = "✋ SAYA HADIR"; btn.disabled = false; }
}

// --- E. ANGGOTA & PROFIL ---
function loadAnggotaRealtime() {
    const q = query(collection(db, "class_members"), where("classId", "==", currentClassId));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('member-list');
        container.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            container.innerHTML += `<div class="activity-item" style="cursor:default;"><span>${data.studentName}</span><span class="badge" style="background:#d1fae5; color:#059669;">Siswa</span></div>`;
        });
    });
}

function loadProfileData() {
    // Cek apakah data user sudah ada
    if (!currentUserData) return;

    // --- BAGIAN 1: ISI FORMULIR PROFIL (DATA DASAR) ---
    document.getElementById('prof-name').value = currentUserData.name || '';
    document.getElementById('prof-email').value = currentUserData.email || '';
    
    // Set Label Role & NIS/NIP
    const isGuru = currentUserData.role === 'teacher';
    document.getElementById('prof-role').value = isGuru ? 'Guru' : 'Siswa';
    document.getElementById('label-id-number').textContent = isGuru ? "NIP / NIK" : "NISN / NIK";
    
    // Data Tambahan
    document.getElementById('prof-nis').value = currentUserData.nis_nip || '';
    document.getElementById('prof-phone').value = currentUserData.phone || '';
    document.getElementById('prof-school').value = currentUserData.school || '';
    document.getElementById('prof-address').value = currentUserData.address || ''; 

    // --- BAGIAN 2: FOTO PROFIL ---
    const photoUrl = currentUserData.photoUrl || '';
    document.getElementById('prof-photo-url').value = photoUrl; 
    // Jika tidak ada foto, pakai avatar inisial nama
    document.getElementById('prof-avatar-img').src = photoUrl || `https://ui-avatars.com/api/?name=${currentUserData.name}`;

    // --- BAGIAN 3: STATUS / BIO (YANG BARU) ---
    
    // A. Isi kotak input di Halaman Pengaturan (Jika elemennya ada)
    const bioInput = document.getElementById('settings-bio');
    if(bioInput) {
        bioInput.value = currentUserData.bio || ''; 
    }

    // B. Tampilkan teks di Halaman Profil (Jika elemennya ada)
    const bioDisplay = document.getElementById('prof-bio-display');
    if(bioDisplay) {
        bioDisplay.textContent = currentUserData.bio || "Belum ada status.";
    }
}

async function saveProfile() {
    const updateData = {
        name: document.getElementById('prof-name').value,
        nis_nip: document.getElementById('prof-nis').value,
        phone: document.getElementById('prof-phone').value,
        school: document.getElementById('prof-school').value,
        address: document.getElementById('prof-address').value,
        photoUrl: document.getElementById('prof-photo-url').value,
        status: 'Aktif'
    };
    await updateDoc(doc(db, "users", currentUserData.email), updateData);
    Object.assign(currentUserData, updateData);
    alert("Profil Berhasil Disimpan!");
    loadProfileData();
}

// --- REGISTER & ACTIONS ---
window.toggleTeacherCode = () => {
    const role = document.getElementById('reg-role').value;
    document.getElementById('teacher-code-group').classList.toggle('hidden', role !== 'teacher');
};

document.getElementById('link-register').onclick = (e) => { e.preventDefault(); document.getElementById('register-modal').classList.remove('hidden'); };
document.getElementById('btn-cancel-register').onclick = () => document.getElementById('register-modal').classList.add('hidden');

document.getElementById('btn-submit-register').onclick = async () => {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value;
    const role = document.getElementById('reg-role').value; 
    const code = document.getElementById('reg-teacher-code').value;

    if(role === 'teacher' && code !== 'GURU2024') return alert("⛔ KODE TOKEN SALAH!");
    if(pass.length < 6) return alert("Password minimal 6 karakter");

    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", email), { name, email, role, createdAt: new Date().toISOString(), status: 'Aktif' });
        alert("Akun Berhasil Dibuat!"); location.reload();
    } catch(error) { alert("Gagal Daftar: " + error.message); }
};

// =========================================
//    PERBAIKAN LOGIN HANDLER
//    Tambahkan script ini di AKHIR script.js
// =========================================

console.log("🔧 Loading login fix...");

// Hapus semua event listener lama dan pasang yang baru
(function initLogin() {
    console.log("🚀 Initializing login system...");
    
    // Tunggu sampai DOM benar-benar siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupLoginHandlers);
    } else {
        setupLoginHandlers();
    }
})();

function setupLoginHandlers() {
    console.log("📌 Setting up login handlers...");
    
    // Cek apakah Firebase sudah siap
    if (typeof auth === 'undefined' || typeof db === 'undefined') {
        console.error("❌ Firebase not loaded! Retrying in 1 second...");
        setTimeout(setupLoginHandlers, 1000);
        return;
    }
    
    console.log("✅ Firebase ready!");
    
    // ===== TOMBOL LOGIN EMAIL =====
    const btnLogin = document.getElementById('btn-login-email');
    const inputEmail = document.getElementById('username');
    const inputPassword = document.getElementById('password');
    
    if (!btnLogin || !inputEmail || !inputPassword) {
        console.error("❌ Login elements not found!");
        console.log("Button:", btnLogin);
        console.log("Email input:", inputEmail);
        console.log("Password input:", inputPassword);
        return;
    }
    
    console.log("✅ Found all login elements");
    
    // Hapus event listener lama dengan cara clone node
    const newButton = btnLogin.cloneNode(true);
    btnLogin.parentNode.replaceChild(newButton, btnLogin);
    
    // Pasang event listener baru
    newButton.addEventListener('click', handleEmailLogin);
    
    // Support Enter key
    inputPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleEmailLogin();
        }
    });
    
    console.log("✅ Login handlers attached!");
    
    // ===== TOMBOL GOOGLE LOGIN =====
    const btnGoogle = document.getElementById('btn-login-google');
    if (btnGoogle) {
        const newGoogleBtn = btnGoogle.cloneNode(true);
        btnGoogle.parentNode.replaceChild(newGoogleBtn, btnGoogle);
        newGoogleBtn.addEventListener('click', handleGoogleLogin);
        console.log("✅ Google login handler attached!");
    }
    
    // ===== LINK REGISTER =====
    const linkRegister = document.getElementById('link-register');
    if (linkRegister) {
        linkRegister.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-modal').classList.remove('hidden');
        });
    }
    
    const btnCancelReg = document.getElementById('btn-cancel-register');
    if (btnCancelReg) {
        btnCancelReg.addEventListener('click', () => {
            document.getElementById('register-modal').classList.add('hidden');
        });
    }
    
    const btnSubmitReg = document.getElementById('btn-submit-register');
    if (btnSubmitReg) {
        const newRegBtn = btnSubmitReg.cloneNode(true);
        btnSubmitReg.parentNode.replaceChild(newRegBtn, btnSubmitReg);
        newRegBtn.addEventListener('click', handleRegister);
    }
}

// ===== FUNGSI LOGIN EMAIL =====
async function handleEmailLogin(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    console.log("🔐 LOGIN BUTTON CLICKED!");
    
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    console.log("📧 Email:", email);
    console.log("🔑 Password length:", password.length);
    
    // Validasi input
    if (!email) {
        alert("❌ Email tidak boleh kosong!");
        document.getElementById('username').focus();
        return;
    }
    
    if (!password) {
        alert("❌ Password tidak boleh kosong!");
        document.getElementById('password').focus();
        return;
    }
    
    if (!email.includes('@')) {
        alert("❌ Format email tidak valid!");
        document.getElementById('username').focus();
        return;
    }
    
    if (password.length < 6) {
        alert("❌ Password minimal 6 karakter!");
        document.getElementById('password').focus();
        return;
    }
    
    // Tampilkan loading
    const loading = document.getElementById('loading-overlay');
    if (loading) {
        loading.classList.remove('hidden');
    }
    
    try {
        console.log("⏳ Attempting Firebase login...");
        
        // Import fungsi dari Firebase (pastikan sudah di-load)
        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        console.log("✅ LOGIN SUCCESS!");
        console.log("User:", userCredential.user.email);
        
        // Loading akan ditutup otomatis oleh onAuthStateChanged listener
        
    } catch (error) {
        console.error("❌ LOGIN ERROR:", error.code);
        console.error("Error message:", error.message);
        
        // Tutup loading
        if (loading) {
            loading.classList.add('hidden');
        }
        
        // Pesan error yang user-friendly
        let errorMessage = "Login gagal!";
        
        switch (error.code) {
            case 'auth/invalid-credential':
                errorMessage = "❌ Email atau password salah!";
                break;
            case 'auth/user-not-found':
                errorMessage = "❌ Email tidak terdaftar!\n\nSilakan daftar terlebih dahulu.";
                break;
            case 'auth/wrong-password':
                errorMessage = "❌ Password salah!";
                break;
            case 'auth/invalid-email':
                errorMessage = "❌ Format email tidak valid!";
                break;
            case 'auth/too-many-requests':
                errorMessage = "❌ Terlalu banyak percobaan login!\n\nSilakan tunggu beberapa saat.";
                break;
            case 'auth/network-request-failed':
                errorMessage = "❌ Tidak ada koneksi internet!";
                break;
            default:
                errorMessage = "❌ Error: " + error.message;
        }
        
        alert(errorMessage);
    }
}

// ===== FUNGSI LOGIN GOOGLE =====
async function handleGoogleLogin(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    console.log("🔐 GOOGLE LOGIN CLICKED!");
    
    const loading = document.getElementById('loading-overlay');
    if (loading) {
        loading.classList.remove('hidden');
    }
    
    try {
        const { signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
        
        await signInWithPopup(auth, googleProvider);
        
        console.log("✅ Google login success!");
        
    } catch (error) {
        console.error("❌ Google login error:", error);
        
        if (loading) {
            loading.classList.add('hidden');
        }
        
        alert("Login Google gagal: " + error.message);
    }
}

console.log("✅ Login fix script loaded!");

// ===== REGISTER FUNCTION =====
async function handleRegister() {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const role = document.getElementById('reg-role').value;
    const code = document.getElementById('reg-teacher-code').value.trim();
    
    if (!name || !email || !pass) {
        alert("❌ Semua field wajib diisi!");
        return;
    }
    
    if (role === 'teacher' && code !== 'GURU2024') {
        alert("❌ KODE TOKEN GURU SALAH!");
        return;
    }
    
    if (pass.length < 6) {
        alert("❌ Password minimal 6 karakter!");
        return;
    }
    
    const loading = document.getElementById('loading-overlay');
    if (loading) loading.classList.remove('hidden');
    
    try {
        // Create account
        await createUserWithEmailAndPassword(auth, email, pass);
        
        // Save to Firestore
        await setDoc(doc(db, "users", email), {
            name: name,
            email: email,
            role: role,
            createdAt: new Date().toISOString(),
            status: 'Aktif'
        });
        
        alert("✅ Akun berhasil dibuat!\n\nSilakan login.");
        location.reload();
        
    } catch (error) {
        console.error("Register error:", error);
        if (loading) loading.classList.add('hidden');
        
        let msg = "Gagal membuat akun!";
        
        if (error.code === 'auth/email-already-in-use') {
            msg = "❌ Email sudah terdaftar! Silakan login.";
        } else if (error.code === 'auth/weak-password') {
            msg = "❌ Password terlalu lemah!";
        } else {
            msg = "❌ " + error.message;
        }
        
        alert(msg);
    }
}

// FUNGSI TERPISAH UNTUK HANDLE LOGIN (LEBIH CLEAN)
async function handleLogin() {
    console.log("🔐 Login button clicked!");
    
    const email = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;

    console.log("Email:", email);
    console.log("Password length:", pass.length);

    if (!email || !pass) {
        alert("⚠️ Mohon isi Email dan Password!");
        return;
    }

    // Validasi format email sederhana
    if (!email.includes('@')) {
        alert("⚠️ Format email tidak valid!");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    
    try {
        console.log("⏳ Attempting login...");
        loadingOverlay.classList.remove('hidden');
        
        // Proses Login Firebase
        await signInWithEmailAndPassword(auth, email, pass);
        
        console.log("✅ Login successful!");
        // onAuthStateChanged akan otomatis handle redirect
        
    } catch (error) {
        console.error("❌ Login Error:", error);
        loadingOverlay.classList.add('hidden');
        
        // Pesan error yang lebih user-friendly
        let errorMsg = "Login Gagal!";
        
        if (error.code === 'auth/invalid-credential') {
            errorMsg = "Email atau Password salah!";
        } else if (error.code === 'auth/user-not-found') {
            errorMsg = "Email tidak terdaftar!";
        } else if (error.code === 'auth/wrong-password') {
            errorMsg = "Password salah!";
        } else if (error.code === 'auth/invalid-email') {
            errorMsg = "Format email tidak valid!";
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = "Terlalu banyak percobaan! Coba lagi nanti.";
        } else {
            errorMsg = error.message;
        }
        
        alert("🚫 " + errorMsg);
    }
}

async function handleJoinClass() {
    const code = document.getElementById('join-class-code').value;
    const q = query(collection(db, "classes"), where("code", "==", code));
    const snap = await getDocs(q);
    if(snap.empty) return alert("Kode Kelas Salah!");
    
    const classId = snap.docs[0].id;
    await addDoc(collection(db, "class_members"), { classId, studentEmail: auth.currentUser.email, studentName: currentUserData.name });
    alert("Berhasil Gabung!"); location.reload();
}

window.toggleProfileMenu = () => document.getElementById('profile-dropdown').classList.toggle('hidden');
window.handleLogout = () => { signOut(auth).then(() => window.location.reload()); };
window.showPage = (p) => {
    // 1. Daftar ID semua halaman content
   const pages = ['dashboard', 'class-detail', 'profile', 'calendar', 'settings', 'discussion', 'transcript', 'my-classes', 'search-result'];

    // 2. Sembunyikan SEMUA halaman konten
    pages.forEach(page => {
        const el = document.getElementById(page + '-page');
        if(el) el.classList.add('hidden');
    });

    // 3. Reset Detail Tugas (Biar gak nyangkut)
    if(p !== 'class-detail') {
        const assignmentDetail = document.getElementById('assignment-detail-page');
        if(assignmentDetail) assignmentDetail.classList.add('hidden');
    }

    if(p === 'discussion') {
        document.getElementById('discussion-page').classList.remove('hidden');
        loadDiscussion(); // Panggil fungsi untuk memuat chat
    }

    if(p === 'transcript') {
        document.getElementById('transcript-page').classList.remove('hidden');
        loadTranscript(); // Panggil fungsi baru
    }
    
    if(p === 'my-classes') {
        document.getElementById('my-classes-page').classList.remove('hidden');
        loadMyClassesPage(); // Panggil fungsi baru
    }

    if(p === 'search-result') {
        document.getElementById('search-result-page').classList.remove('hidden');
    }

    // 4. Tampilkan Halaman yang Dipilih
    const targetPage = document.getElementById(p + '-page');
    if(targetPage) targetPage.classList.remove('hidden');

    // 5. Khusus: Load data jika masuk Profil
    if(p === 'profile') loadProfileData();
    // 6. Khusus: Load kalender jika masuk Kalender
    if(p === 'calendar' && typeof renderCalendar === 'function') renderCalendar();


    // === 👇 INI BAGIAN BARU (LOGIKA SIDEBAR NYALA) 👇 ===
    
    // A. Matikan (Hapus class 'active') dari SEMUA menu di sidebar
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    // B. Nyalakan (Tambah class 'active') ke menu yang sedang dipilih
    const activeMenu = document.getElementById('menu-' + p);
    if(activeMenu) {
        activeMenu.classList.add('active');
    }

    // === TAMBAHAN BARU: Update Dashboard Stats ===
    if (p === 'dashboard') {
        // Tampilkan loading skeleton
        showLoadingSkeleton();
        
        // Update statistik dengan delay dikit biar smooth
        setTimeout(() => {
            // Update tugas (kalau user siswa)
            if (currentUserData && currentUserData.role === 'student') {
                updateTaskStatistics();
            }
            
            // Hilangkan loading
            hideLoadingSkeleton();
        }, 500);
    }
};
window.onclick = (e) => { if (!e.target.closest('.profile-trigger')) document.getElementById('profile-dropdown').classList.add('hidden'); };
window.deleteClass = async (e, classId) => { 
    e.stopPropagation(); 
    
    // ✅ PERINGATAN LENGKAP
    if(!confirm("⚠️ PERINGATAN!\n\nMenghapus kelas akan:\n✗ Menghapus semua materi\n✗ Menghapus semua tugas & kuis\n✗ Menghapus semua nilai siswa\n✗ Menghapus semua absensi\n✗ Mengeluarkan semua siswa dari kelas\n\nYakin ingin melanjutkan?")) return;
    
    const loading = document.getElementById('loading-overlay');
    loading.classList.remove('hidden');
    
    try {
        // ✅ GUNAKAN BATCH DELETE UNTUK EFISIENSI
        const batch = writeBatch(db);
        
        // 1. Hapus semua materi
        const qMat = query(collection(db, "materials"), where("classId", "==", classId));
        const snapMat = await getDocs(qMat);
        snapMat.forEach(doc => batch.delete(doc.ref));
        
        // 2. Hapus semua tugas
        const qTask = query(collection(db, "assignments"), where("classId", "==", classId));
        const snapTask = await getDocs(qTask);
        snapTask.forEach(doc => batch.delete(doc.ref));
        
        // 3. Hapus semua kuis
        const qQuiz = query(collection(db, "quizzes"), where("classId", "==", classId));
        const snapQuiz = await getDocs(qQuiz);
        snapQuiz.forEach(doc => batch.delete(doc.ref));
        
        // 4. ✅ HAPUS SEMUA SUBMISSION (NILAI) - INI YANG PENTING!
        const qSub = query(collection(db, "submissions"), where("classId", "==", classId));
        const snapSub = await getDocs(qSub);
        snapSub.forEach(doc => batch.delete(doc.ref));
        
        // 5. Hapus semua absensi
        const qAtt = query(collection(db, "attendance"), where("classId", "==", classId));
        const snapAtt = await getDocs(qAtt);
        snapAtt.forEach(doc => batch.delete(doc.ref));
        
        // 6. Hapus semua member
        const qMem = query(collection(db, "class_members"), where("classId", "==", classId));
        const snapMem = await getDocs(qMem);
        snapMem.forEach(doc => batch.delete(doc.ref));
        
        // 7. Hapus kelas itu sendiri
        batch.delete(doc(db, "classes", classId));
        
        // ✅ COMMIT SEMUA PERUBAHAN SEKALIGUS
        await batch.commit();
        
        alert("✅ Kelas dan SEMUA data terkait berhasil dihapus!");
        
    } catch (error) {
        console.error("Error deleting class:", error);
        alert("Gagal menghapus kelas: " + error.message);
    } finally {
        loading.classList.add('hidden');
    }
};

// =========================================
// BAGIAN B: LOGIKA PEMBUATAN KUIS (GURU)
// =========================================

// 1. Fungsi untuk menambah kolom soal baru di Modal
window.addQuestionField = () => {
    const container = document.getElementById('questions-container');
    const index = container.children.length + 1;
    
    const html = `
    <div class="question-card" id="q-card-${index}">
        <label class="question-label">Pertanyaan No. ${index}</label>
        <input type="text" class="form-input q-text" placeholder="Tulis pertanyaan di sini..." style="margin-bottom:10px;">
        
        <div style="font-size:0.8rem; margin-bottom:5px; color:#64748b;">
            Isi pilihan ganda (A-E) & klik bulatan pada jawaban yang benar:
        </div>
        
        <div class="option-group">
            <input type="radio" name="correct-${index}" value="0" class="correct-selector" checked> 
            <input type="text" class="form-input q-opt" placeholder="Pilihan A">
        </div>
        <div class="option-group">
            <input type="radio" name="correct-${index}" value="1" class="correct-selector"> 
            <input type="text" class="form-input q-opt" placeholder="Pilihan B">
        </div>
        <div class="option-group">
            <input type="radio" name="correct-${index}" value="2" class="correct-selector"> 
            <input type="text" class="form-input q-opt" placeholder="Pilihan C">
        </div>
        <div class="option-group">
            <input type="radio" name="correct-${index}" value="3" class="correct-selector"> 
            <input type="text" class="form-input q-opt" placeholder="Pilihan D">
        </div>
        <div class="option-group">
            <input type="radio" name="correct-${index}" value="4" class="correct-selector"> 
            <input type="text" class="form-input q-opt" placeholder="Pilihan E">
        </div>
    </div>`;
    
    container.insertAdjacentHTML('beforeend', html);
};

// 2. Fungsi untuk Menyimpan Kuis ke Database Firebase
window.saveQuiz = async () => {
    const title = document.getElementById('quiz-title').value;
    const cards = document.querySelectorAll('.question-card');
    let questions = [];

    // Ambil data dari setiap kartu soal
    cards.forEach((card, i) => {
        const index = i + 1;
        const text = card.querySelector('.q-text').value;
        // Ambil text dari 4 opsi input
        const opts = Array.from(card.querySelectorAll('.q-opt')).map(input => input.value);
        
        // Cari radio button mana yang dipilih guru sebagai kunci jawaban
        const correctRadio = card.querySelector(`input[name="correct-${index}"]:checked`);
        const correctIdx = correctRadio ? parseInt(correctRadio.value) : 0;

        // Validasi: Soal dan Opsi A harus terisi minimal
        if(text && opts[0]) {
            questions.push({ 
                text: text, 
                options: opts, 
                correctIndex: correctIdx 
            });
        }
    });

    if(!title || questions.length === 0) {
        return alert("Mohon isi Judul Kuis dan minimal 1 Pertanyaan lengkap!");
    }

    const btn = document.querySelector('button[onclick="saveQuiz()"]');
    btn.textContent = "Menyimpan...";
    btn.disabled = true;

    try {
        // Simpan ke koleksi 'quizzes'
        await addDoc(collection(db, "quizzes"), {
            classId: currentClassId,
            title: title,
            questions: questions,
            createdAt: new Date().toISOString(),
            type: 'quiz' // Penanda bahwa ini kuis, bukan tugas upload
        });
        
        alert("Kuis Berhasil Diterbitkan!");
        document.getElementById('modal-create-quiz').classList.add('hidden');
        document.getElementById('quiz-title').value = ''; // Reset judul
        
        // Refresh list tugas agar kuis langsung muncul
        loadTugasRealtime(); 
        
    } catch(e) { 
        alert("Error saat menyimpan: " + e.message); 
    } finally {
        btn.textContent = "Terbitkan Kuis";
        btn.disabled = false;
    }
};

// =========================================
// BAGIAN D: SISWA MENGERJAKAN KUIS (AUTO-NILAI)
// =========================================

// Variabel Global untuk Kuis
let currentQuizData = null;
let currentQuizId = null;

// 1. Fungsi Membuka Modal Kuis (Siswa)
window.startQuiz = async (quizId) => {
    // Cek dulu: Apakah siswa sudah pernah mengerjakan?
    const myEmail = auth.currentUser.email;
    const subId = `${quizId}_${myEmail}`;
    
    try {
        const existingSub = await getDoc(doc(db, "submissions", subId));
        
        // Jika sudah ada datanya, tolak akses
        if(existingSub.exists()) {
            const skor = existingSub.data().score;
            return alert(`Kamu sudah mengerjakan kuis ini!\nNilai kamu: ${skor}`);
        }

        // Jika belum, ambil data soal dari database
        currentQuizId = quizId;
        const snap = await getDoc(doc(db, "quizzes", quizId));
        
        if (!snap.exists()) return alert("Data kuis tidak ditemukan.");
        
        currentQuizData = snap.data();
        
        // Tampilkan Judul
        document.getElementById('do-quiz-title').textContent = currentQuizData.title;
        
        // Render Soal ke dalam Modal
        const area = document.getElementById('quiz-content-area');
        area.innerHTML = "";

        currentQuizData.questions.forEach((q, index) => {
            let optsHtml = "";
            
            // Loop opsi jawaban (A, B, C, D)
            q.options.forEach((opt, optIdx) => {
                optsHtml += `
                <label class="quiz-option-item" style="display:block;">
                    <input type="radio" name="ans-${index}" value="${optIdx}"> 
                    ${opt}
                </label>`;
            });

            area.innerHTML += `
            <div style="margin-bottom:20px;">
                <p style="font-weight:bold; margin-bottom:10px;">${index + 1}. ${q.text}</p>
                ${optsHtml}
            </div>
            <hr style="border:0; border-top:1px solid #eee; margin:15px 0;">`;
        });

        // Buka Modal
        document.getElementById('modal-do-quiz').classList.remove('hidden');
        
        // Siapkan tombol submit
        document.getElementById('btn-submit-quiz').onclick = submitQuizAnswers;

    } catch (e) {
        alert("Error memuat kuis: " + e.message);
    }
};

// 2. Fungsi Hitung Nilai & Simpan (Auto-Grading)
async function submitQuizAnswers() {
    let score = 0;
    let totalQ = currentQuizData.questions.length;
    let pointPerQ = 100 / totalQ; // Misal 10 soal, berarti 1 soal = 10 poin

    // Loop setiap soal untuk mencocokkan jawaban
    currentQuizData.questions.forEach((q, index) => {
        // Ambil radio button yang dipilih user pada soal nomor sekian
        const selected = document.querySelector(`input[name="ans-${index}"]:checked`);
        
        if(selected) {
            // Bandingkan nilai pilihan user dengan kunci jawaban (correctIndex)
            if(parseInt(selected.value) === q.correctIndex) {
                score += pointPerQ;
            }
        }
    });

    score = Math.round(score); // Bulatkan nilai biar rapi

    // Konfirmasi sebelum kirim
    if(confirm(`Yakin kirim jawaban?\n\nPastikan semua soal sudah terisi.`)) {
        const btn = document.getElementById('btn-submit-quiz');
        btn.textContent = "Mengirim...";
        btn.disabled = true;

        try {
            const subId = `${currentQuizId}_${auth.currentUser.email}`;
            
            // Simpan ke database submissions (Sama seperti tugas biasa, agar masuk rekap nilai)
            await setDoc(doc(db, "submissions", subId), {
                taskId: currentQuizId, 
                classId: currentClassId,
                studentName: currentUserData.name,
                studentEmail: auth.currentUser.email,
                score: score, // INI NILAI OTOMATISNYA
                type: 'quiz_result',
                timestamp: new Date().toISOString()
            });

            alert(`Jawaban Terkirim!\n\n🎉 Nilai Kamu: ${score}`);
            document.getElementById('modal-do-quiz').classList.add('hidden');
            
            // Refresh list agar tombol berubah jadi "Sudah Dikerjakan" (opsional/reload)
            loadNilaiRekap(); 

        } catch(e) {
            alert("Gagal kirim: " + e.message);
        } finally {
            btn.textContent = "Kirim Jawaban";
            btn.disabled = false;
        }
    }
}

// =========================================
// BAGIAN F: FITUR DOWNLOAD REKAP NILAI (DENGAN JUMLAH TUGAS)
// =========================================

window.downloadRekapNilai = async () => {
    if (currentUserData.role !== 'teacher') {
        return alert("Hanya Guru yang bisa mendownload rekap nilai!");
    }

    const btn = document.getElementById('btn-download-nilai');
    btn.textContent = "Menyiapkan Data...";
    btn.disabled = true;

    try {
        // 1. Ambil Data dari Database
        const q = query(collection(db, "submissions"), where("classId", "==", currentClassId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            alert("Belum ada data nilai untuk didownload.");
            btn.textContent = "📥 Download Excel";
            btn.disabled = false;
            return;
        }

        // 2. Olah Data (Hitung Total Skor & Jumlah Tugas per Siswa)
        const rekap = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const nama = data.studentName || "Tanpa Nama";
            const nilai = parseInt(data.score) || 0;

            if (!rekap[nama]) {
                rekap[nama] = {
                    totalSkor: 0,
                    jumlahTugas: 0
                };
            }
            rekap[nama].totalSkor += nilai;
            rekap[nama].jumlahTugas += 1; // Menambah hitungan tugas yang diselesaikan
        });

        const urutan = Object.keys(rekap).sort((a, b) => rekap[b].totalSkor - rekap[a].totalSkor);

        // 3. Buat Struktur HTML Table
        let tableHTML = `
        <table border="1" style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr style="background-color: #4f46e5; color: white; text-align: center;">
                    <th style="padding: 10px;">Ranking</th>
                    <th style="padding: 10px; width: 250px;">Nama Siswa</th>
                    <th style="padding: 10px; width: 100px;">Total Skor</th>
                    <th style="padding: 10px; width: 100px;">Tugas Selesai</th>
                    <th style="padding: 10px; width: 100px;">Rata-Rata</th>
                    <th style="padding: 10px; width: 150px;">Keterangan</th>
                </tr>
            </thead>
            <tbody>
        `;

        let rank = 1;
        urutan.forEach(nama => {
            const dataSiswa = rekap[nama];
            const rataRata = Math.round(dataSiswa.totalSkor / dataSiswa.jumlahTugas);
            const bg = rank % 2 === 0 ? '#f1f5f9' : '#ffffff';
            
            let predikat = rataRata >= 90 ? "Sangat Baik" : (rataRata >= 75 ? "Baik" : "Cukup");
            
            tableHTML += `
                <tr style="background-color: ${bg};">
                    <td style="text-align: center; padding: 5px;">${rank}</td>
                    <td style="padding: 5px;">${nama}</td>
                    <td style="text-align: center; padding: 5px; font-weight: bold;">${dataSiswa.totalSkor}</td>
                    <td style="text-align: center; padding: 5px;">${dataSiswa.jumlahTugas}</td>
                    <td style="text-align: center; padding: 5px; background-color: #e0e7ff;">${rataRata}</td>
                    <td style="text-align: center; padding: 5px;">${predikat}</td>
                </tr>
            `;
            rank++;
        });

        tableHTML += `</tbody></table>`;

        // 4. Proses Download file Excel (.xls)
        const dataType = 'application/vnd.ms-excel';
        const namaKelas = document.getElementById('detail-class-title').textContent || "Kelas";
        const fileName = `Rekap_Nilai_${namaKelas.replace(/\s+/g, '_')}.xls`;

        const downloadLink = document.createElement("a");
        document.body.appendChild(downloadLink);

        const blob = new Blob(['\ufeff', tableHTML], {
            type: dataType
        });

        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = fileName;
        downloadLink.click();
        
        document.body.removeChild(downloadLink);
        alert("Berhasil! File Excel dengan jumlah tugas dan rata-rata telah didownload.");

    } catch (error) {
        console.error("Gagal download:", error);
        alert("Terjadi kesalahan: " + error.message);
    } finally {
        btn.textContent = "📥 Download Excel";
        btn.disabled = false;
    }
};

// =========================================
// BAGIAN G: FITUR KALENDER SEDERHANA
// =========================================

let currentDate = new Date();

function renderCalendar() {
    const monthYear = document.getElementById('month-year-display');
    const container = document.getElementById('calendar-days');
    if(!container) return;

    container.innerHTML = ""; // Bersihkan

    // Set Judul Bulan Tahun (Indonesia)
    const options = { month: 'long', year: 'numeric' };
    monthYear.textContent = currentDate.toLocaleDateString('id-ID', options);

    // Logika Tanggal
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // Hari pertama bulan ini (0=Minggu)
    const lastDate = new Date(year, month + 1, 0).getDate(); // Tanggal terakhir bulan ini

    // Kotak Kosong (sebelum tanggal 1)
    for (let i = 0; i < firstDayIndex; i++) {
        container.innerHTML += `<div class="calendar-day empty"></div>`;
    }

    // Kotak Tanggal 1 s/d 30/31
    const today = new Date();
    for (let i = 1; i <= lastDate; i++) {
        // Cek apakah ini hari ini?
        const isToday = (i === today.getDate() && month === today.getMonth() && year === today.getFullYear());
        const activeClass = isToday ? "today" : "";
        
        container.innerHTML += `<div class="calendar-day ${activeClass}">${i}</div>`;
    }
}

window.changeMonth = (direction) => {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
};

// =========================================
// BAGIAN H: FITUR TAMBAHAN (DARK MODE, UPLOAD FOTO, PASSWORD)
// =========================================

// --- 1. DARK MODE LOGIC ---
const themeToggle = document.getElementById('dark-mode-toggle');

// Cek apakah user pernah simpan preferensi dark mode
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if(themeToggle) themeToggle.checked = true;
}

// Listener saat checkbox diklik
if(themeToggle) {
    themeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark'); // Simpan ke memori browser
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
    });
}

// --- UPLOAD FOTO PROFIL (REAL CLOUDINARY) --- //
const profInput = document.getElementById('prof-file-input');
if(profInput) {
    profInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const progressText = document.getElementById('upload-progress-text');
        progressText.textContent = "Sedang mengupload...";
        
        try {
            // Upload ke Cloudinary (Pakai fungsi yang sudah ada)
            const photoUrl = await uploadToCloudinary(file);
            
            // Update Tampilan Langsung
            document.getElementById('prof-avatar-img').src = photoUrl;
            document.getElementById('prof-photo-url').value = photoUrl; // Simpan URL di hidden input
            document.getElementById('nav-avatar').innerHTML = `<img src="${photoUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;

            // Update ke Firebase Auth (User Profile)
            await updateProfile(auth.currentUser, { photoURL: photoUrl });

            // Update ke Firestore (Database User)
            await updateDoc(doc(db, "users", auth.currentUser.email), { photoUrl: photoUrl });

            progressText.textContent = "✅ Foto berhasil diganti!";
            progressText.style.color = "green";
            
            // Simpan data global
            currentUserData.photoUrl = photoUrl;

        } catch (error) {
            console.error(error);
            progressText.textContent = "❌ Gagal upload.";
            progressText.style.color = "red";
        }
    });
}

// FITUR SIMPAN BIO (PENGGANTI PASSWORD) //
    const btnSaveBio = document.getElementById('btn-save-bio');
    
    if (btnSaveBio) {
        btnSaveBio.onclick = async () => {
            const bioText = document.getElementById('settings-bio').value;
            const btn = document.getElementById('btn-save-bio');

            btn.textContent = "Menyimpan...";
            btn.disabled = true;

            try {
                // Update ke Database Firestore
                await updateDoc(doc(db, "users", auth.currentUser.email), {
                    bio: bioText
                });

                // Update data di memori lokal biar langsung berubah
                if(currentUserData) currentUserData.bio = bioText;

                alert("✅ Status berhasil disimpan!");
            } catch (error) {
                console.error(error);
                alert("Gagal menyimpan: " + error.message);
            } finally {
                btn.textContent = "Simpan Status";
                btn.disabled = false;
            }
        };
    }

// =========================================
//       FITUR DISKUSI / CHAT GLOBAL
// =========================================

let unsubscribeChat = null; // Variabel untuk mematikan listener saat pindah halaman

function loadDiscussion() {
    const container = document.getElementById('chat-container');
    const myEmail = auth.currentUser.email;

    // Supaya tidak double listener
    if (unsubscribeChat) unsubscribeChat();

    // Query: Ambil pesan, urutkan dari yang terlama ke terbaru (biar seperti WA)
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));

    unsubscribeChat = onSnapshot(q, (snapshot) => {
        container.innerHTML = ""; // Reset
        
        if (snapshot.empty) {
            container.innerHTML = `<div style="text-align:center; margin-top:50px; color:#94a3b8;">
                <div style="font-size:3rem;">👋</div>
                <p>Belum ada obrolan.<br>Jadilah yang pertama menyapa!</p>
            </div>`;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const isMe = (data.senderEmail === myEmail);
            
            // Format Jam (HH:MM)
            const date = new Date(data.timestamp);
            const time = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

            // Tentukan Style (Saya vs Orang Lain)
            const bubbleClass = isMe ? "message-me" : "message-other";
            
            // Render HTML Balon Chat
            const html = `
                <div class="message-bubble ${bubbleClass}">
                    <span class="message-sender">${data.senderName}</span>
                    ${data.text}
                    <span class="message-time">${time}</span>
                </div>
            `;
            container.innerHTML += html;
        });

        // Auto Scroll ke Bawah (Biar pesan baru kelihatan)
        container.scrollTop = container.scrollHeight;
    });
}

window.sendChat = async () => {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();

    if (!text) return; // Jangan kirim kalau kosong

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            senderEmail: auth.currentUser.email,
            senderName: currentUserData.name, // Mengambil nama dari profil user
            timestamp: new Date().toISOString()
        });
        
        input.value = ""; // Bersihkan input setelah kirim
    } catch (error) {
        console.error("Gagal kirim pesan:", error);
        alert("Gagal mengirim pesan.");
    }
};

// =========================================
//         FITUR TRANSKRIP NILAI
// =========================================

async function loadTranscript() {
    const listContainer = document.getElementById('transcript-list');
    const emptyMsg = document.getElementById('trans-empty-msg');
    const myEmail = auth.currentUser.email;

    listContainer.innerHTML = ""; // Bersihkan tabel
    emptyMsg.classList.remove('hidden');

    try {
        // 1. Ambil semua submission milik user ini
        const q = query(collection(db, "submissions"), where("studentEmail", "==", myEmail));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            document.getElementById('trans-total-tugas').textContent = "0";
            document.getElementById('trans-avg-score').textContent = "-";
            return;
        }

        emptyMsg.classList.add('hidden'); // Sembunyikan pesan kosong

        let totalScore = 0;
        let count = 0;

        // 2. Loop setiap nilai
        // Kita butuh "Nama Kelas" juga, tapi di submission cuma ada classId.
        // Trik Cepat: Kita ambil nama kelas secara parallel.
        
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const score = parseInt(data.score) || 0;
            
            // Ambil Nama Kelas (Optional: bisa skip kalau mau cepat, tapi lebih bagus ada)
            let className = "Kelas Tidak Dikenal";
            if(data.classId) {
                const classSnap = await getDoc(doc(db, "classes", data.classId));
                if(classSnap.exists()) className = classSnap.data().title;
            }

            // Tentukan Status (KKM misal 75)
            const statusBadge = score >= 75 
                ? `<span class="badge" style="background:#dcfce7; color:#166534;">Lulus</span>` 
                : `<span class="badge" style="background:#fee2e2; color:#991b1b;">Remedial</span>`;

            // Render Baris Tabel
            const html = `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px; font-weight:500;">${className}</td>
                    <td style="padding: 12px;">${data.taskId || 'Tugas'}</td> 
                    <td style="padding: 12px; font-weight:bold;">${score}</td>
                    <td style="padding: 12px;">${statusBadge}</td>
                </tr>
            `;
            listContainer.insertAdjacentHTML('beforeend', html);

            totalScore += score;
            count++;
        }

        // 3. Update Statistik Atas
        document.getElementById('trans-total-tugas').textContent = count;
        document.getElementById('trans-avg-score').textContent = Math.round(totalScore / count);

    } catch (error) {
        console.error("Gagal memuat transkrip:", error);
        emptyMsg.textContent = "Gagal memuat data.";
    }
}

// =========================================
// BAGIAN K: FITUR HALAMAN KELAS SAYA
// =========================================

let unsubscribeMyClasses = null;

function loadMyClassesPage() {
    const container = document.getElementById('all-classes-grid');
    const myEmail = auth.currentUser.email;

    if (unsubscribeMyClasses) unsubscribeMyClasses();

    // Tentukan Query berdasarkan Role
    let q;
    if (currentUserData.role === 'teacher') {
        // Guru: Ambil kelas yang dia buat
        q = query(collection(db, "classes"), where("teacherEmail", "==", myEmail));
        
        // Jalankan Listener
        unsubscribeMyClasses = onSnapshot(q, (snapshot) => {
            renderClassesToGrid(snapshot.docs, container);
        });

    } else {
        // Siswa: Ambil kelas yang dia ikuti (Lewat tabel class_members)
        const qMember = query(collection(db, "class_members"), where("studentEmail", "==", myEmail));
        
        unsubscribeMyClasses = onSnapshot(qMember, async (snapshot) => {
            if (snapshot.empty) {
                container.innerHTML = `<p class="text-muted">Belum bergabung di kelas manapun.</p>`;
                return;
            }
            // Ambil detail kelas satu per satu
            const classPromises = snapshot.docs.map(async (memberDoc) => {
                const classId = memberDoc.data().classId;
                return getDoc(doc(db, "classes", classId));
            });
            
            const classDocs = await Promise.all(classPromises);
            const validDocs = classDocs.filter(d => d.exists()); // Filter yang valid saja
            
            renderClassesToGrid(validDocs, container);
        });
    }
}

// Fungsi Helper untuk Render Grid (Biar rapi)
function renderClassesToGrid(docs, container) {
    container.innerHTML = "";
    
    if(docs.length === 0) {
        container.innerHTML = `<p class="text-muted">Tidak ada kelas.</p>`;
        return;
    }

    docs.forEach(doc => {
        const data = doc.data();
        const colors = ['blue', 'green', 'orange', 'purple', 'pink']; 
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Tentukan tombol berdasarkan role
        const isOwner = (auth.currentUser.email === data.teacherEmail);
        let actionBtn = '';
        
        if (isOwner) {
            actionBtn = `<button onclick="deleteClass(event, '${doc.id}')" title="Hapus Kelas"
              style="position:absolute; top:10px; right:10px; background:rgba(255,255,255,0.9); border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; color:red; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">✕</button>`;
        } else {
            actionBtn = `<button onclick="leaveClass(event, '${doc.id}')" title="Keluar dari Kelas"
              style="position:absolute; top:10px; right:10px; background:rgba(255,255,255,0.9); border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; color:#dc2626; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">🚪</button>`;
        }

        const html = `
            <div class="class-card" onclick="showClassDetail('${doc.id}')" style="position: relative; transition: transform 0.2s; cursor: pointer;">
                ${actionBtn}
                <div class="class-banner ${randomColor}" style="height: 100px; display:flex; align-items:center; justify-content:center; font-size:3rem; color:rgba(255,255,255,0.3);">
                    ${data.title ? data.title.charAt(0).toUpperCase() : '?'}
                </div>
                <div class="class-info" style="padding: 15px;">
                    <div class="class-title" style="font-size: 1.1rem; font-weight:bold; margin-bottom:5px;">${data.title || 'Tanpa Nama'}</div>
                    <div class="class-meta" style="color:#64748b; font-size:0.85rem;">
                        📅 ${data.scheduleDay || '-'} • ⏰ ${data.scheduleTime || '-'}
                    </div>
                    <div class="class-meta" style="margin-top:10px; font-size:0.8rem; display:flex; align-items:center; gap:5px;">
                        <span style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">👨‍🏫 ${data.teacherName || 'Guru'}</span>
                    </div>
                </div>
            </div>`;
        
        container.insertAdjacentHTML('beforeend', html);
    });
}

// =========================================
//             GLOBAL SEARCH 🔍
// =========================================

async function handleGlobalSearch(keyword) {
    keyword = keyword.trim().toLowerCase();
    if (!keyword) return;

    // 1. Pindah ke Halaman Search
    showPage('search-result');
    document.getElementById('search-keyword-display').textContent = `"${keyword}"`;
    
    const container = document.getElementById('search-results-container');
    container.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div><p style="text-align:center;">Mencari data...</p>`;

    try {
        // 2. Ambil Data Kelas & Tugas (Parallel biar cepat)
        // Kita ambil semua dulu baru filter manual (Keterbatasan Firestore)
        const [classesSnap, tasksSnap] = await Promise.all([
            getDocs(collection(db, "classes")),
            getDocs(collection(db, "assignments"))
        ]);

        let resultsHTML = "";
        let count = 0;

        // --- FILTER KELAS ---
        classesSnap.forEach(doc => {
            const data = doc.data();
            const title = (data.title || "").toLowerCase();
            const teacher = (data.teacherName || "").toLowerCase();

            // Cek apakah judul atau nama guru mengandung keyword
            if (title.includes(keyword) || teacher.includes(keyword)) {
                count++;
                resultsHTML += `
                    <div class="activity-item" onclick="showClassDetail('${doc.id}')">
                        <div style="flex:1;">
                            <div class="activity-title">📚 Kelas: ${data.title}</div>
                            <div class="activity-subtitle">Guru: ${data.teacherName}</div>
                        </div>
                        <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;">Lihat</button>
                    </div>
                `;
            }
        });

        // --- FILTER TUGAS ---
        tasksSnap.forEach(doc => {
            const data = doc.data();
            const title = (data.title || "").toLowerCase();
            const desc = (data.description || "").toLowerCase();

            if (title.includes(keyword) || desc.includes(keyword)) {
                count++;
                // Tugas butuh classId untuk dibuka, pastikan data punya classId
                // Jika user klik, kita bawa ke detail kelas (tab tugas)
                resultsHTML += `
                    <div class="activity-item" onclick="showClassDetail('${data.classId}')">
                        <div style="flex:1;">
                            <div class="activity-title">📝 Tugas: ${data.title}</div>
                            <div class="activity-subtitle">${desc.substring(0, 50)}...</div>
                        </div>
                        <span class="badge badge-pending">Tugas</span>
                    </div>
                `;
            }
        });

        // 3. Tampilkan Hasil
        if (count === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 30px;">
                    <span style="font-size:3rem; opacity:0.5;">🔍</span>
                    <p class="text-muted">Tidak ditemukan hasil untuk "${keyword}"</p>
                </div>`;
        } else {
            container.innerHTML = `<p class="text-muted" style="margin-bottom:15px;">Ditemukan ${count} hasil:</p>` + resultsHTML;
        }

    } catch (error) {
        console.error("Error searching:", error);
        container.innerHTML = `<p style="color:red; text-align:center;">Terjadi kesalahan saat mencari.</p>`;
    }
    window.handleGlobalSearch = handleGlobalSearch;
}

// =========================================
//     LOGIKA BUAT KELAS (CREATE CLASS)
// =========================================

window.createClass = async () => {
    const titleInput = document.getElementById('class-title');
    const dayInput = document.getElementById('class-day');
    const timeInput = document.getElementById('class-time');

    const title = titleInput.value.trim();
    const day = dayInput.value;
    const time = timeInput.value;

    if (!title || !day || !time) {
        alert("Mohon lengkapi data kelas!");
        return;
    }

    // --- LOGIKA GENERATE KODE OTOMATIS ---
    // Mengambil 3 huruf depan mata pelajaran + angka acak
    const randomNum = Math.floor(100 + Math.random() * 900); // Angka 100-999
    const classCode = (title.substring(0, 3).toUpperCase()) + randomNum;

    const btn = document.querySelector('#create-class-modal .btn-primary');
    btn.textContent = "Menyimpan...";
    btn.disabled = true;

    try {
        await addDoc(collection(db, "classes"), {
            title: title,
            scheduleDay: day,
            scheduleTime: time,
            code: classCode, // SIMPAN KODE DI SINI
            teacherEmail: auth.currentUser.email,
            teacherName: currentUserData.name || "Guru",
            createdAt: new Date().toISOString()
        });

        document.getElementById('create-class-modal').classList.add('hidden');
        titleInput.value = "";
        alert(`✅ Kelas Berhasil Dibuat! Kode Kelas: ${classCode}`);

    } catch (error) {
        console.error("Gagal membuat kelas:", error);
        alert("Error: " + error.message);
    } finally {
        btn.textContent = "Simpan Kelas";
        btn.disabled = false;
    }
};

// =========================================
//   MULTI-FILE UPLOAD (SISWA)
// =========================================

// Fungsi untuk Handle Multi-File Selection
window.handleMultiFileUpload = (input) => {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    
    selectedFiles = files; // Pastikan 'let selectedFiles = [];' sudah ada di paling atas file JS
    
    const previewContainer = document.getElementById('file-preview-container');
    const fileListDiv = document.getElementById('file-list');
    
    // Pastikan container muncul (mengubah display: none jadi block)
    previewContainer.style.display = 'block';
    fileListDiv.innerHTML = ''; 
    
    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        
        // Gunakan variabel CSS (var) supaya otomatis berubah saat Dark Mode aktif
        fileItem.style.cssText = `
            padding: 12px; 
            background: rgba(255, 255, 255, 0.05); 
            border-radius: 8px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            border: 1px solid var(--border-color);
            margin-bottom: 8px;
        `;
        
        fileItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 1.5rem;">${file.type.includes('image') ? '🖼️' : '📄'}</span>
                <div style="text-align: left;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">${file.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${(file.size / 1024).toFixed(1)} KB</div>
                </div>
            </div>
            <button onclick="removeFile(${index})" class="btn" 
                    style="padding: 5px 10px; font-size: 0.7rem; background: #fee2e2; color: #ef4444; border: none; cursor: pointer;">
                ✕ Hapus
            </button>
        `;
        fileListDiv.appendChild(fileItem);
    });
    
    document.getElementById('upload-status-text').textContent = `✅ ${files.length} file dipilih`;
};

// Fungsi untuk Hapus File dari Preview
window.removeFile = (index) => {
    selectedFiles.splice(index, 1);
    
    const input = document.getElementById('student-file-upload');
    const dt = new DataTransfer();
    selectedFiles.forEach(file => dt.items.add(file));
    input.files = dt.files;
    
    handleMultiFileUpload(input);
    
    if (selectedFiles.length === 0) {
        document.getElementById('file-preview-container').style.display = 'none';
        document.getElementById('upload-status-text').textContent = 
            '📄 Klik untuk upload file (bisa lebih dari 1)';
    }
};

// Fungsi untuk Submit Multi-File
window.submitMultipleAssignments = async () => {
    if (selectedFiles.length === 0) {
        return alert("Pilih minimal 1 file jawaban!");
    }
    
    const btn = document.querySelector('#student-upload-area button.btn-primary');
    btn.textContent = `Mengupload ${selectedFiles.length} file...`;
    btn.disabled = true;

    try {
        const uploadPromises = selectedFiles.map(file => uploadToCloudinary(file));
        const uploadedUrls = await Promise.all(uploadPromises);
        
        const allFilesUrl = uploadedUrls.join(',');
        
        const subId = `${currentTaskId}_${auth.currentUser.email}`;
        await setDoc(doc(db, "submissions", subId), {
            taskId: currentTaskId,
            classId: currentClassId,
            studentName: currentUserData.name,
            studentEmail: auth.currentUser.email,
            fileUrl: allFilesUrl,
            fileCount: selectedFiles.length,
            timestamp: new Date().toISOString()
        });
        
        alert(`✅ Berhasil! ${selectedFiles.length} file terkirim.`);
        
        selectedFiles = [];
        document.getElementById('student-file-upload').value = '';
        document.getElementById('file-preview-container').style.display = 'none';
        document.getElementById('upload-status-text').textContent = '✅ Tugas Sudah Dikumpulkan';
        
    } catch (e) {
        alert("Gagal upload: " + e.message);
    } finally {
        btn.textContent = "Kirim Semua File";
        btn.disabled = false;
    }
};

// Backward compatibility
window.handleFileUpload = handleMultiFileUpload;
window.submitAssignment = submitMultipleAssignments;

// =========================================
//    FITUR HAPUS MATERI & TUGAS (GURU)
// =========================================

window.deleteMateri = async (e, materiId) => {
    e.stopPropagation(); // Jangan trigger onclick parent
    
    if (!confirm("Yakin ingin menghapus materi ini?")) return;
    
    try {
        await deleteDoc(doc(db, "materials", materiId));
        alert("✅ Materi berhasil dihapus!");
    } catch (error) {
        alert("Gagal menghapus: " + error.message);
    }
};

window.deleteTugas = async (e, tugasId) => {
    e.stopPropagation();
    
    if (!confirm("Yakin ingin menghapus tugas ini?\n\nSemua pengumpulan siswa juga akan terhapus!")) return;
    
    try {
        // 1. Hapus tugas
        await deleteDoc(doc(db, "assignments", tugasId));
        
        // 2. Hapus semua submission terkait tugas ini
        const qSub = query(collection(db, "submissions"), where("taskId", "==", tugasId));
        const snapSub = await getDocs(qSub);
        
        const deletePromises = snapSub.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        
        alert("✅ Tugas berhasil dihapus!");
    } catch (error) {
        alert("Gagal menghapus: " + error.message);
    }
};

window.deleteQuiz = async (e, quizId) => {
    e.stopPropagation();
    
    if (!confirm("Yakin ingin menghapus kuis ini?\n\nSemua hasil siswa juga akan terhapus!")) return;
    
    try {
        await deleteDoc(doc(db, "quizzes", quizId));
        
        const qSub = query(collection(db, "submissions"), where("taskId", "==", quizId));
        const snapSub = await getDocs(qSub);
        const deletePromises = snapSub.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        
        alert("✅ Kuis berhasil dihapus!");
    } catch (error) {
        alert("Gagal menghapus: " + error.message);
    }
};

// Memastikan tombol berfungsi
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('btn-login-email');
    if (loginBtn) {
        loginBtn.onclick = (e) => {
            e.preventDefault();
            handleEmailLogin();
        };
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const btnSubmitJoin = document.getElementById('btn-submit-join');
    if (btnSubmitJoin) {
        btnSubmitJoin.onclick = (e) => {
            e.preventDefault();
            console.log("Tombol Gabung diklik!"); // Untuk cek di console
            handleJoinClass();
        };
    }
});


// =========================================
// FUNGSI 1: ANIMASI ANGKA NAIK (COUNT UP)
// =========================================

function animateValue(elementId, start, end, duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const range = end - start;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + (range * easeOut));
        
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = end; // Pastikan nilai akhir tepat
        }
    }
    
    requestAnimationFrame(update);
}

// =========================================
// FUNGSI 2: UPDATE PROGRESS BAR
// =========================================

function updateProgressBar(barId, percentage) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    
    // Set width dengan delay biar kelihatan animasinya
    setTimeout(() => {
        bar.style.width = percentage + '%';
    }, 300);
}

// =========================================
// FUNGSI 3: UPDATE STAT CARD (All-in-One)
// =========================================

function updateStatCard(valueId, progressId, newValue, maxValue = 100) {
    // Ambil nilai lama (untuk animasi count up)
    const element = document.getElementById(valueId);
    const oldValue = parseInt(element.textContent) || 0;
    
    // 1. Animasi angka naik
    animateValue(valueId, oldValue, newValue, 1000);
    
    // 2. Update progress bar
    const percentage = maxValue > 0 ? Math.min((newValue / maxValue) * 100, 100) : 0;
    updateProgressBar(progressId, percentage);
}

// =========================================
// FUNGSI 4: UPDATE BADGE URGENT
// =========================================

function updateUrgentBadge(pendingCount) {
    const badge = document.getElementById('badge-urgent');
    if (!badge) return;
    
    // Tampilkan badge jika ada lebih dari 3 tugas pending
    if (pendingCount >= 3) {
        badge.style.display = 'block';
        badge.textContent = pendingCount + ' Tugas!';
    } else {
        badge.style.display = 'none';
    }
}

// =========================================
// FUNGSI 5: SHOW LOADING SKELETON
// =========================================

function showLoadingSkeleton() {
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach(card => {
        card.classList.add('skeleton');
    });
}

function hideLoadingSkeleton() {
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach(card => {
        card.classList.remove('skeleton');
    });
}

// =========================================
//    FITUR KELUAR KELAS (UNTUK SISWA)
// =========================================

window.leaveClass = async (e, classId) => {
    e.stopPropagation(); // Jangan trigger onclick parent
    
    if (!confirm("⚠️ PERINGATAN!\n\nKeluar dari kelas akan:\n✗ Menghapus semua nilai Anda di kelas ini\n✗ Menghapus semua tugas yang sudah dikumpulkan\n✗ Menghapus rekam absensi Anda\n\nYakin ingin keluar dari kelas ini?")) {
        return;
    }
    
    const loading = document.getElementById('loading-overlay');
    loading.classList.remove('hidden');
    
    try {
        const myEmail = auth.currentUser.email;
        
        // 1. Hapus dari class_members
        const qMember = query(
            collection(db, "class_members"), 
            where("classId", "==", classId),
            where("studentEmail", "==", myEmail)
        );
        const snapMember = await getDocs(qMember);
        
        if (!snapMember.empty) {
            await deleteDoc(snapMember.docs[0].ref);
        }
        
        // 2. Hapus semua submission siswa di kelas ini
        const qSub = query(
            collection(db, "submissions"),
            where("classId", "==", classId),
            where("studentEmail", "==", myEmail)
        );
        const snapSub = await getDocs(qSub);
        const deleteSubPromises = snapSub.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deleteSubPromises);
        
        // 3. Hapus semua absensi siswa di kelas ini
        const qAtt = query(
            collection(db, "attendance"),
            where("classId", "==", classId),
            where("studentEmail", "==", myEmail)
        );
        const snapAtt = await getDocs(qAtt);
        const deleteAttPromises = snapAtt.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deleteAttPromises);
        
        alert("✅ Anda berhasil keluar dari kelas!");
        
        // Refresh halaman atau kembali ke dashboard
        showPage('dashboard');
        
    } catch (error) {
        console.error("Error leaving class:", error);
        alert("❌ Gagal keluar dari kelas: " + error.message);
    } finally {
        loading.classList.add('hidden');
    }
};
