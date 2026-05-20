import { useParams, Link } from "wouter";
import { useListCampaigns, useGetBrand, getListCampaignsQueryKey, getGetBrandQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Megaphone, Calendar, FileText, ChevronLeft, Loader2, Plus, Sparkles } from "lucide-react";

export default function CampaignList() {
  const params = useParams<{ id: string }>();
  const brandId = parseInt(params.id, 10);

  const { data: brand } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });
  const { data: campaigns, isLoading } = useListCampaigns(brandId, {
    query: { enabled: !!brandId, queryKey: getListCampaignsQueryKey(brandId) },
  });

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto space-y-7">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/brands/${brandId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {brand?.companyName ?? "العلامة التجارية"} — الحملات الإعلانية
          </h1>
          <p className="text-sm text-muted-foreground">جميع الحملات التسويقية المولَّدة بالذكاء الاصطناعي</p>
        </div>
        <Link
          href={`/brands/${brandId}/campaigns/new`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          حملة جديدة
        </Link>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : !Array.isArray(campaigns) || campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-14 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Megaphone className="w-7 h-7 text-primary/60" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">لا توجد حملات بعد</h3>
            <p className="text-sm text-muted-foreground">أنشئ حملتك الأولى باستخدام مدير المهام الذكي</p>
          </div>
          <Link
            href={`/brands/${brandId}/campaigns/new`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
          >
            <Sparkles className="w-4 h-4" />
            إنشاء أول حملة
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(campaigns as Array<{
            id: number;
            title: string;
            strategy?: string;
            days?: unknown[];
            posts?: unknown[];
            dayCount?: number;
            createdAt?: string;
            updatedAt?: string;
          }>).map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="flex items-start justify-between gap-4 p-5 rounded-2xl border border-card-border bg-card hover:bg-muted/30 transition-all duration-200 group"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm text-foreground leading-snug">{campaign.title}</h3>
                  {campaign.strategy && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-lg leading-relaxed">
                      {campaign.strategy}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      {campaign.dayCount ?? campaign.days?.length ?? 0} يوم مخطط
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      {campaign.posts?.length ?? 0} منشور
                    </div>
                    {campaign.createdAt && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(campaign.createdAt).toLocaleDateString("ar-SA", {
                          year: "numeric", month: "short", day: "numeric"
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0 mt-1 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
