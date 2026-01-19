"""
Management command to archive old submissions.

Usage:
    python manage.py archive_old_submissions --days=90 --batch-size=1000
    python manage.py archive_old_submissions --dry-run  # Preview only
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from apps.submissions.models import Submission


class Command(BaseCommand):
    help = '將舊的 contest submissions 歸檔（保留 practice 在主表）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='歸檔 N 天前的資料（預設 90 天）'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='每批處理的數量（預設 1000）'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='預覽模式，不實際刪除資料'
        )
        parser.add_argument(
            '--contest-only',
            action='store_true',
            default=True,
            help='只歸檔 contest 提交（預設 True）'
        )

    def handle(self, *args, **options):
        days = options['days']
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        contest_only = options['contest_only']
        
        cutoff_date = timezone.now() - timedelta(days=days)
        
        self.stdout.write(f'歸檔設定：')
        self.stdout.write(f'  截止日期: {cutoff_date.strftime("%Y-%m-%d %H:%M:%S")}')
        self.stdout.write(f'  批次大小: {batch_size}')
        self.stdout.write(f'  模式: {"預覽" if dry_run else "實際執行"}')
        self.stdout.write(f'  範圍: {"只有 contest" if contest_only else "所有類型"}')
        self.stdout.write('')
        
        # Build query
        query = Submission.objects.filter(created_at__lt=cutoff_date)
        
        if contest_only:
            # 只歸檔已結束的考試提交
            # 保留 practice 提交在主表中（因為可能會被經常查看）
            query = query.filter(source_type='contest')
            
            # 可選：只歸檔已結束的考試
            # query = query.filter(contest__status='draft')
        
        total = query.count()
        
        if total == 0:
            self.stdout.write(self.style.SUCCESS('沒有需要歸檔的資料'))
            return
        
        self.stdout.write(f'找到 {total:,} 筆需要歸檔的資料')
        
        if dry_run:
            # 預覽模式：顯示統計資訊
            self.preview_archive_stats(query)
            self.stdout.write(self.style.WARNING('\n⚠️  這是預覽模式，沒有實際刪除資料'))
            self.stdout.write('移除 --dry-run 參數以實際執行歸檔')
            return
        
        # 確認
        self.stdout.write(self.style.WARNING(f'\n即將刪除 {total:,} 筆資料！'))
        confirm = input('確定要繼續嗎？ (yes/no): ')
        
        if confirm.lower() != 'yes':
            self.stdout.write(self.style.ERROR('已取消'))
            return
        
        # 執行歸檔
        self.perform_archive(query, batch_size, total)
    
    def preview_archive_stats(self, queryset):
        """顯示歸檔統計資訊"""
        from django.db.models import Count
        
        self.stdout.write('\n統計資訊：')
        
        # 按狀態分組
        status_stats = queryset.values('status').annotate(count=Count('id')).order_by('-count')
        self.stdout.write('\n  按狀態：')
        for stat in status_stats[:10]:
            self.stdout.write(f"    {stat['status']}: {stat['count']:,}")
        
        # 按語言分組
        language_stats = queryset.values('language').annotate(count=Count('id')).order_by('-count')
        self.stdout.write('\n  按語言：')
        for stat in language_stats:
            self.stdout.write(f"    {stat['language']}: {stat['count']:,}")
        
        # 按月份分組
        from django.db.models.functions import TruncMonth
        month_stats = queryset.annotate(
            month=TruncMonth('created_at')
        ).values('month').annotate(
            count=Count('id')
        ).order_by('month')[:12]
        
        self.stdout.write('\n  按月份（最早 12 個月）：')
        for stat in month_stats:
            month_str = stat['month'].strftime('%Y-%m')
            self.stdout.write(f"    {month_str}: {stat['count']:,}")
    
    def perform_archive(self, queryset, batch_size, total):
        """執行歸檔操作"""
        
        # TODO: 如果要實作真正的歸檔，需要：
        # 1. 建立 SubmissionArchive model
        # 2. 複製資料到歸檔表
        # 3. 刪除原資料
        
        # 目前的實作：直接刪除舊資料（簡化版）
        # 在 production 環境使用前，請先實作完整的歸檔功能
        
        self.stdout.write(self.style.WARNING('\n注意：目前直接刪除資料（無歸檔表）'))
        self.stdout.write('如需保留資料，請先實作 SubmissionArchive model')
        
        confirm = input('\n確定要刪除這些資料嗎？ (DELETE/cancel): ')
        if confirm != 'DELETE':
            self.stdout.write(self.style.ERROR('已取消'))
            return
        
        deleted_count = 0
        
        # 分批刪除
        while True:
            with transaction.atomic():
                # Get batch of IDs
                batch_ids = list(
                    queryset.values_list('id', flat=True)[:batch_size]
                )
                
                if not batch_ids:
                    break
                
                # Delete batch
                deleted, _ = Submission.objects.filter(id__in=batch_ids).delete()
                deleted_count += deleted
                
                # Progress
                progress = (deleted_count / total) * 100
                self.stdout.write(
                    f'進度: {deleted_count:,}/{total:,} ({progress:.1f}%)',
                    ending='\r'
                )
        
        self.stdout.write('')  # New line
        self.stdout.write(
            self.style.SUCCESS(f'\n✅ 成功刪除 {deleted_count:,} 筆資料')
        )
