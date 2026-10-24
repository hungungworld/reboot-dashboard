"""콘텐츠 제작 기준 목록 — 화면 tabs/content/static/data.js와 같은 ID를 씁니다 (tabs/content/tests/test_content.py가 확인).

제품 목록은 여기 두지 않고 공용 팩트시트(server/catalog)에서 읽습니다.
"""

# 만들 콘텐츠 (README 2.2) → 기본 텍스트 결과물 종류
CONTENT_TYPES = {
    "image": {"label": "이미지", "kind": "copy"},
    "cardnews": {"label": "카드뉴스", "kind": "cardnews"},
    "shortform": {"label": "숏폼 영상", "kind": "script"},
    "product_desc": {"label": "상품 설명", "kind": "desc"},
    "crm": {"label": "CRM 메시지", "kind": "crm"},
    "plan": {"label": "캠페인 기획서", "kind": "plan"},
}

# 게시 채널 — short는 자동 캠페인명용
CHANNELS = {
    "instagram": {"label": "Instagram", "short": "인스타"},
    "tiktok": {"label": "TikTok", "short": "틱톡"},
    "amazon": {"label": "Amazon", "short": "아마존"},
    "weee": {"label": "Weee", "short": "Weee"},
    "yamibuy": {"label": "Yamibuy", "short": "Yamibuy"},
    "crm": {"label": "CRM", "short": "CRM"},
}

STATUSES = ("제작 중", "검토 중", "완료")

# 결과물(버전) 종류
KIND_LABELS = {
    "copy": "카피", "cardnews": "카드뉴스", "script": "숏폼 구성안", "desc": "상품 설명",
    "crm": "CRM 메시지", "plan": "기획서", "image": "이미지", "video": "영상",
}
TEXT_KINDS = ("copy", "cardnews", "script", "desc", "crm", "plan")

# 모델의 action_request.type → 텍스트 결과물 종류
ACTION_KINDS = {
    "draft_copy": "copy", "draft_cardnews": "cardnews", "draft_script": "script",
    "draft_desc": "desc", "draft_crm": "crm", "draft_plan": "plan",
}
ACTION_TYPES = ("none",) + tuple(ACTION_KINDS) + ("generate_image", "edit_image", "generate_video", "select_version")
INTENTS = ("question", "idea", "update_decision", "draft", "generate_media", "edit", "compare_versions",
           "select_version", "save", "chitchat", "other")

SHEET_LABELS = {
    "content_type": "콘텐츠", "channels": "게시 채널", "brand_focus": "브랜드 자체",
    "product_ids": "제작 대상 제품", "goal": "목적", "extra_request": "추가 요청",
}

# 창작 결정 항목 (decisions.<키>) — 목록에 없는 영문 키도 허용, 표시 이름만 여기서
DECISION_LABELS = {
    "concept": "콘셉트", "background": "배경", "tone": "말투·톤", "style": "스타일", "layout": "제품 배치",
    "ratio": "비율", "language": "결과물 언어", "cta": "CTA", "headline": "헤드라인", "message": "핵심 메시지",
    "target": "타깃", "length": "길이", "format": "형식", "season": "시즌", "accent_color": "포인트 색",
    "featured_product": "메인 제품", "slide_count": "장 수", "duration": "영상 길이", "lighting": "조명",
    "composition": "구도", "mood": "분위기", "caption": "캡션", "hashtags": "해시태그", "subtitle": "자막",
    "use_character": "캐릭터 Rebu", "flavor": "맛",
}
# 모델이 한국어 키를 줄 때
DECISION_ALIASES = {
    "배경": "background", "톤": "tone", "말투": "tone", "콘셉트": "concept", "컨셉": "concept", "언어": "language",
    "비율": "ratio", "스타일": "style", "배치": "layout", "헤드라인": "headline", "타깃": "target", "타겟": "target",
    "길이": "length", "형식": "format", "시즌": "season", "핵심메시지": "message", "핵심 메시지": "message",
    "구도": "composition", "조명": "lighting", "분위기": "mood", "자막": "subtitle",
    "캐릭터": "use_character", "리부": "use_character", "rebu": "use_character", "character": "use_character",
    "mascot": "use_character", "맛": "flavor",
}

# 제품·브랜드 사실에 해당하는 키 — 대화로 바꾸지 않고 '확인 대기'로 기록 (README 3.4)
FACT_KEYS = frozenset({
    "ingredients", "ingredient", "price", "cost", "volume", "size_ml", "ml", "weight", "net_weight", "calories", "kcal",
    "sugar", "sugar_g", "sugar_content", "sugar_reduction", "nutrition", "nutrition_facts", "certification",
    "certifications", "efficacy", "health_claim", "benefit_claim", "stick_count", "pack_count", "bottle_size",
    "flavors", "flavor_lineup", "product_name", "consumer_name", "allergens", "origin", "slogan", "brand_name",
})

# 접어 둔 고급 옵션 (README 4.2 초기 제안값)
DEFAULT_SETTINGS = {"answer_length": "short", "candidates": 3, "rewrite_max": 1, "video_mode": "plan_only",
                    "image_provider": "openai"}
ANSWER_LENGTHS = {"short": "짧게 (2~4문장)", "normal": "보통 (5~7문장)", "long": "자세히"}
# 이미지 AI 제공사 · 영상 모드 (Higgsfield는 HIGGSFIELD_API_KEY가 있을 때만 실제 호출)
IMAGE_PROVIDERS = {"openai": "OpenAI", "higgsfield": "Higgsfield (Marketing Studio)"}
VIDEO_MODES = {"plan_only": "구성안만 (실제 영상 아님)", "higgsfield": "실제 영상 (Higgsfield Seedance 2.0 · 720p)"}

GOAL_PRESETS = ("브랜드 알리기", "제품 소개", "구매 유도", "재구매")


def example_suggestions(field, sheet):
    """키가 없거나 AI 추천이 실패할 때의 예시 추천 3개 (화면에 '예시 추천'으로 표시).

    제작 아이디어일 뿐 시장 분석 결과가 아니며, 성분·가격·효능·수치는 넣지 않습니다.
    """
    ct = sheet.get("content_type") or ""
    products = sheet.get("product_ids") or []
    brand_only = bool(sheet.get("brand_focus")) and not products
    multi = len(products) > 1
    if field == "goal":
        if brand_only:
            items = [("브랜드 첫인상 알리기", "브랜드 자체를 고른 경우 이름과 분위기를 먼저 보여 주기 좋아요"),
                     ("슬로건 'Restart Your Day' 소개", "확인된 슬로건을 그대로 쓸 수 있어요"),
                     ("브랜드 색(검정 & 네온) 알리기", "시각 콘텐츠에서 브랜드 색을 기억하게 해요")]
        elif ct == "crm":
            items = [("재구매 유도", "이미 구매한 고객에게 다시 떠올리게 하는 메시지예요"),
                     ("신규 구독자 환영", "처음 연결된 고객에게 브랜드를 소개해요"),
                     ("제품 소식 알리기", "선택한 제품의 확인된 정보(형태·구성)만으로 소식을 전해요")]
        elif ct == "product_desc":
            items = [("제품 소개", "형태·포장 같은 확인된 정보 중심으로 정리해요"),
                     ("구매 유도", "상세페이지에서 구매 결정을 돕는 구성이에요"),
                     ("검색용 핵심 정보 정리", "제목·특징 문구를 채널 형식에 맞춰요")]
        elif ct == "plan":
            items = [("시즌 캠페인 기획", "다가오는 시즌에 맞춘 일정·채널 구성을 잡아요"),
                     ("브랜드 알리기", "처음 보는 고객에게 Reboot를 소개하는 흐름이에요"),
                     ("구매 유도", "채널별로 구매까지 이어지는 동선을 정리해요")]
        elif multi:
            items = [("라인업 함께 소개", "여러 제품을 고른 경우 제품별 정보를 나눠 함께 보여 줘요"),
                     ("브랜드와 제품 연결", "Restart Your Day 메시지와 제품을 이어 줘요"),
                     ("구매 유도", "구매처 안내까지 이어지는 구성이에요")]
        else:
            items = [("제품 소개", "선택한 제품의 형태와 맛 후보(임시)를 보여 줘요"),
                     ("브랜드 알리기", "제품을 통해 Reboot 브랜드를 기억하게 해요"),
                     ("구매 유도", "구매처 안내까지 이어지는 구성이에요")]
    else:
        if ct == "image":
            items = [("검정 배경에 네온 포인트, 문구는 영어로", "브랜드 색(검정 & 네온)을 바로 보여 줘요"),
                     ("제품을 화면 가운데 크게, 여백 넉넉히" if products else "슬로건이 주인공인 간결한 구성",
                      "한눈에 들어오는 단순한 구성이에요"),
                     ("두 제품을 나란히, 제품별 정보는 따로" if multi else "아침 일상 장면 느낌의 밝은 무드",
                      "여러 제품을 섞지 않고 보여 줘요" if multi else "Restart Your Day와 어울리는 분위기예요")]
        elif ct == "cardnews":
            items = [("5장 구성, 첫 장은 슬로건으로 시작", "훅 → 소개 → 마무리 흐름이 자연스러워요"),
                     ("장마다 문구 한 줄 + 짧은 설명", "모바일에서 읽기 쉬워요"),
                     ("마지막 장에 구매처 안내", "다음 행동을 분명히 해요")]
        elif ct == "shortform":
            items = [("15초 세로형, 영어 자막", "숏폼 기본 길이와 형식이에요"),
                     ("첫 2초 안에 제품이나 슬로건 노출", "초반 이탈을 줄이는 구성이에요"),
                     ("아침 루틴 장면으로 시작", "Restart Your Day 메시지와 이어져요")]
        elif ct == "product_desc":
            items = [("Amazon 형식(제목 · 특징 5개 · 설명)", "채널 필드에 맞춰 바로 옮겨 쓸 수 있어요"),
                     ("모르는 스펙은 [확인 필요]로 비워 두기", "용량·성분처럼 미제공 정보는 채우지 않아요"),
                     ("짧고 쉬운 영어 문장", "미국 고객이 빠르게 읽을 수 있어요")]
        elif ct == "crm":
            items = [("이메일 1통 + SMS 1개, 짧게", "처음엔 작은 단위로 시작해요"),
                     ("제목은 40자 이내", "받은편지함에서 잘리지 않아요"),
                     ("할인·쿠폰 문구 없이", "확인되지 않은 혜택을 만들지 않아요")]
        else:
            items = [("미니 기획(1쪽)으로 먼저", "필요하면 상세 10개 항목으로 늘려요"),
                     ("채널별 콘텐츠 아이디어 3개 포함", "바로 제작으로 이어갈 수 있어요"),
                     ("예산·KPI 수치는 비워 두기", "확인된 입력이 없으면 정하지 않아요")]
    return [{"value": v, "reason": r} for v, r in items]
