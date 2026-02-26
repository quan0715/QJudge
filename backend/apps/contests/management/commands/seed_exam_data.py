"""
Management command to seed exam questions from an OS Exam 1 paper (2025/03/12).
Creates a contest with exam_mode_enabled and populates 31 exam questions.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.contests.models import Contest, ExamQuestion, ExamQuestionType

User = get_user_model()

# ── 31 questions from OS Exam 1 2025/03/12 ─────────────────────────

QUESTIONS = [
    # ── Q1-Q2: 程式概念題 (essay + code block) ──
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": (
            'How many times does the following code print "hello"?\n'
            "```c\n"
            "main () {\n"
            '    if ( fork() <> 0) printf ("hello\\n");\n'
            '    else if ( fork() <> 0) printf ("hello\\n");\n'
            '    printf ("hello\\n");\n'
            "}\n"
            "```"
        ),
        "score": 3,
        "correct_answer": "5",
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": (
            'How many times does this code print "hello"?\n'
            "```c\n"
            "main () {\n"
            "    int i;\n"
            "    for ( i = 0; i < 3; i ++) {\n"
            "        fork();\n"
            '        execl ("/bin/echo", "echo", "hello", 0);\n'
            "    }\n"
            "}\n"
            "```"
        ),
        "score": 3,
        "correct_answer": "2. The execl overwrites the current process by loading /bin/echo. The for loop is gone!",
    },
    # ── Q3-Q17: 問答/簡答題 ──
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "Please list two advantages of multi thread processes over single thread processes?",
        "score": 4,
        "correct_answer": (
            "a. Creating threads and switching among threads is more efficient.\n"
            "b. Some programming is easier since all memory is shared among threads — "
            "no need to use messaging or create shared memory segments."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "What is busy waiting (spinlock)? How can it lead to priority inversion?",
        "score": 6,
        "correct_answer": (
            "a. Busy waiting is the situation when a thread is looping, continuously checking whether a condition "
            "exists that will allow it to continue.\n"
            "b. Process A (low priority) is in a critical section. Process B (high priority) is spinning trying to enter. "
            "A priority scheduler always lets B run over A, so A never releases the lock. B is essentially blocked by A."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": 'What is "local replacement" and "global replacement"?',
        "score": 4,
        "correct_answer": (
            "Local replacement: a process can only select a replacement frame from its own set of allocated frames.\n"
            "Global replacement: a process may select a replacement frame from the set of all memory frames."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "Please list three attributes that are not shared among threads in the same process.",
        "score": 3,
        "correct_answer": "Thread ID, Saved CPU registers, Stack pointer, Program counter, Stack (local variables, temporary variables, return addresses), Signal mask, Priority.",
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "What are the parameters of Multilevel Feedback Queue Scheduling? (List at least three)",
        "score": 3,
        "correct_answer": (
            "a. number of queues\n"
            "b. scheduling algorithms for each queue\n"
            "c. methods used to determine when to upgrade a process\n"
            "d. methods used to determine when to demote a process\n"
            "e. methods used to determine which queue a process will enter when that process needs service"
        ),
    },
    {
        "type": ExamQuestionType.SHORT_ANSWER,
        "prompt": "What is thrashing?",
        "score": 2,
        "correct_answer": "If a process's working set is not a subset of its resident set then the system may exhibit frequent page swapping between the physical memory and the backing store.",
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "What is the difference between a mode switch and a context switch?",
        "score": 4,
        "correct_answer": (
            "Mode switch: change CPU execution mode from one privilege level to another, e.g., user -> kernel via a trap or system call.\n"
            "Context switch: save one process' execution context & restore that of another process."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": (
            "A paging system uses a 2-level page table with an 85% TLB hit ratio. "
            "Assume that the TLB search time is ignorable comparing with the memory access time. "
            "What is the effective average memory access time comparing with the memory access time?"
        ),
        "score": 6,
        "correct_answer": (
            "1.3 times the memory access time.\n"
            "TLB hit: 1 memory access. TLB miss (2-level table): 3 memory accesses.\n"
            "Average = (0.85 x 1) + (0.15 x 3) = 0.85 + 0.45 = 1.3"
        ),
    },
    {
        "type": ExamQuestionType.SHORT_ANSWER,
        "prompt": (
            "A system has 32-bit addresses and 1 GB (2^30) main memory where each page is 1 MB (2^20). "
            "How many entries of a page table will contain?"
        ),
        "score": 3,
        "correct_answer": "2^12 = 4096 entries. Each page is 2^20, so 20 bits for offset. 32 - 20 = 12 bits for page number.",
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": (
            "An inode-based file system uses 8 Kbyte blocks with 4-byte block address. "
            "What is the largest file size that the file system can handle if an inode has "
            "12 direct blocks, 1 indirect block, and 1 double indirect block?"
        ),
        "score": 6,
        "correct_answer": (
            "32 GB + 16 MB + 96 KB.\n"
            "Direct: 12 x 8K = 96 KB.\n"
            "Indirect: 1 x 2K pointers x 8K = 16 MB.\n"
            "Double indirect: 1 x 2K x 2K x 8K = 32 GB."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": (
            "Given a disk with 200 tracks (0-199), the disk head is initially at track 42 moving toward increasing track numbers. "
            "Requested tracks: 116, 22, 3, 11, 75, 185, 100, 87, 186. "
            "What is the order that the requests are serviced by SSTF, SCAN, C-SCAN, and LOOK?"
        ),
        "score": 8,
        "correct_answer": (
            "SSTF: 22, 11, 3, 75, 87, 100, 116, 185, 186\n"
            "SCAN: 75, 87, 100, 116, 185, 186, 22, 11, 3\n"
            "C-SCAN: 75, 87, 100, 116, 185, 186, 3, 11, 22\n"
            "LOOK: 75, 87, 100, 116, 185, 186, 22, 11, 3"
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "Please briefly describe the Direct Memory Access (DMA)?",
        "score": 4,
        "correct_answer": (
            "DMA is a technique that allows devices to transfer data directly to/from main memory "
            "without CPU intervention, reducing CPU usage and improving system performance."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "Please give at least 4 differences between user-level thread and kernel-level thread.",
        "score": 8,
        "correct_answer": (
            "a. Management: User-level managed by application; kernel-level managed by OS.\n"
            "b. Scheduling: User-level scheduled by thread library; kernel-level by OS scheduler.\n"
            "c. Context Switching: User-level switching is faster (no kernel intervention).\n"
            "d. Scalability: Kernel-level can run on multiple cores; user-level bound to single processor."
        ),
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "What is the race condition?",
        "score": 3,
        "correct_answer": "A race condition occurs when two or more threads or processes access a shared resource and the final outcome depends on the order in which they execute.",
    },
    {
        "type": ExamQuestionType.ESSAY,
        "prompt": "What are the internal and external fragmentations?",
        "score": 6,
        "correct_answer": (
            "a. Internal fragmentation: a process is allocated more memory than it needs; the unused portion remains allocated and unusable.\n"
            "b. External fragmentation: enough total memory exists but it is not contiguous, making it difficult to satisfy allocation requests."
        ),
    },
    # ── Q18-Q31: 單選題 ──
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "A memory management unit (MMU) is responsible for:",
        "options": [
            "Translating a process' memory logical addresses to physical addresses.",
            "Allocating kernel memory.",
            "Allocating system memory to processes.",
            "All of the above.",
        ],
        "score": 2,
        "correct_answer": 0,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "A major problem with the base & limit approach to memory translation is:",
        "options": [
            "It requires the process to occupy contiguous memory locations.",
            "The translation process is time-consuming.",
            "The translation must be done for each memory reference.",
            "A process can easily access memory that belongs to another process.",
        ],
        "score": 2,
        "correct_answer": 0,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Thrashing in a virtual memory system is caused by:",
        "options": [
            "A process making too many requests for disk I/O.",
            "Multiple processes requesting disk I/O simultaneously.",
            "Processes not having their working set resident in memory.",
            "Slow operating system response to processing a page fault.",
        ],
        "score": 2,
        "correct_answer": 2,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Which of the following does NOT cause a trap?",
        "options": [
            "A user program divides a number by zero.",
            "The operating system kernel executes a privileged instruction.",
            "A programmable interval timer reaches its specified time.",
            "A user program executes an interrupt instruction.",
        ],
        "score": 2,
        "correct_answer": 1,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Which state transition is not valid?",
        "options": [
            "Ready -> Blocked",
            "Running -> Ready",
            "Ready -> Running",
            "Running -> Blocked",
        ],
        "score": 2,
        "correct_answer": 0,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Which disk scheduling algorithm is most vulnerable to starvation?",
        "options": [
            "SCAN.",
            "Shortest Seek Time First (SSTF).",
            "LOOK.",
            "First Come, First Served (FCFS)",
        ],
        "score": 2,
        "correct_answer": 1,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "The File Allocation Table of Microsoft's FAT32 file system is a variation of:",
        "options": [
            "linked allocation.",
            "contiguous allocation.",
            "indexed allocation.",
            "combined indexing.",
        ],
        "score": 2,
        "correct_answer": 0,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Large page sizes increase:",
        "options": [
            "The working set size.",
            "External fragmentation.",
            "The page table size.",
            "Internal fragmentation.",
        ],
        "score": 2,
        "correct_answer": 3,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "A semaphore puts a thread to sleep:",
        "options": [
            "if it tries to decrement the semaphore's value below 0.",
            "if it increments the semaphore's value above 0.",
            "until another thread issues a notify on the semaphore.",
            "until the semaphore's value reaches a specific number.",
        ],
        "score": 2,
        "correct_answer": 0,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": (
            "There are three processes on a system:\n"
            "- process A runs every 90 ms, using 30 ms of CPU time.\n"
            "- process B runs every 60 ms, using 20 ms of CPU time.\n"
            "- process C runs every 500 ms, using 10 ms of CPU time.\n"
            "Use rate-monotonic analysis to assign priorities (0 = highest, 90 = lowest). "
            "Which is a valid set of priority assignments?"
        ),
        "options": [
            "PA=40, PB=30, PC=100",
            "PA=50, PB=40, PC=90",
            "PA=70, PB=50, PC=60",
            "PA=40, PB=60, PC=20",
        ],
        "score": 2,
        "correct_answer": 1,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Which of process state changing only happen in preemptive scheduler but not in non-preemptive scheduler?",
        "options": [
            "running to blocked",
            "blocked to ready",
            "running to ready",
            "ready to running",
        ],
        "score": 2,
        "correct_answer": 2,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Which type of user thread and kernel thread mapping cannot take advantage of a multiprocessor?",
        "options": ["1:1", "N:1", "N:M", "1:M"],
        "score": 2,
        "correct_answer": 1,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Which of the following CPU scheduling algorithms is non-preemptive scheduler?",
        "options": [
            "Shortest Job First (SJF)",
            "Shortest Remaining Time First (SRTF)",
            "Round Robin (RR)",
            "Rate Monotonic",
        ],
        "score": 2,
        "correct_answer": 0,
    },
    {
        "type": ExamQuestionType.SINGLE_CHOICE,
        "prompt": "Process aging is when:",
        "options": [
            "A long-running process gets pushed to a lower priority level.",
            "A process that did not get to run for a long time gets a higher priority level.",
            "A long-running process gets pushed to a higher priority level.",
            "Memory and other resources are taken away from a process that has run for a long time.",
        ],
        "score": 2,
        "correct_answer": 1,
    },
]


class Command(BaseCommand):
    help = "建立 OS Exam 1 考試題目 seed 資料（31 題，100%）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--contest",
            type=str,
            default="Operating Systems Exam 1",
            help="Contest name to create or use",
        )

    def handle(self, *args, **options):
        contest_name = options["contest"]
        self.stdout.write(f"建立 Exam 題目 seed 資料 → {contest_name}")

        teacher = User.objects.filter(role="teacher").first()
        if not teacher:
            teacher = User.objects.filter(is_superuser=True).first()
        if not teacher:
            self.stderr.write(self.style.ERROR("找不到 teacher 或 admin 帳號，請先執行 seed_e2e_data"))
            return

        now = timezone.now()
        contest, created = Contest.objects.get_or_create(
            name=contest_name,
            defaults={
                "description": "Operating Systems Exam 1 2025/03/12",
                "rules": "Please answer questions in order and leave blank for unanswered questions.",
                "start_time": now - timedelta(hours=1),
                "end_time": now + timedelta(hours=2),
                "owner": teacher,
                "visibility": "private",
                "status": "published",
                "exam_mode_enabled": True,
                "max_cheat_warnings": 3,
                "allow_multiple_joins": False,
                "scoreboard_visible_during_contest": False,
                "allow_view_results": False,
            },
        )

        if created:
            self.stdout.write(f"  ✓ 建立考試: {contest_name}")
        else:
            self.stdout.write(f"  - 考試已存在: {contest_name}")

        # Clear existing questions
        existing_count = contest.exam_questions.count()
        if existing_count > 0:
            contest.exam_questions.all().delete()
            self.stdout.write(f"  ✓ 清除 {existing_count} 題舊題目")

        # Create questions
        for i, q in enumerate(QUESTIONS):
            kwargs = {
                "contest": contest,
                "question_type": q["type"],
                "prompt": q["prompt"],
                "score": q["score"],
                "order": i,
            }
            if "options" in q:
                kwargs["options"] = q["options"]
            if "correct_answer" in q:
                kwargs["correct_answer"] = q["correct_answer"]

            ExamQuestion.objects.create(**kwargs)

        total_score = sum(q["score"] for q in QUESTIONS)
        type_counts = {}
        for q in QUESTIONS:
            t = q["type"]
            type_counts[t] = type_counts.get(t, 0) + 1

        self.stdout.write(f"  ✓ 建立 {len(QUESTIONS)} 題（總配分 {total_score}%）")
        for t, count in sorted(type_counts.items()):
            self.stdout.write(f"    - {t}: {count} 題")
        self.stdout.write(self.style.SUCCESS("✓ Exam seed 資料建立完成"))
