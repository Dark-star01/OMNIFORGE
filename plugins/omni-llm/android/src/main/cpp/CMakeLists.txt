# OmniLlm: llama.cpp (مثبّت على إصدار محدد) + نواة C++ + جسر JNI.
# - على Android: يُبنى عبر Gradle (externalNativeBuild). المصدر يُجلب بـFetchContent من GitHub (يتطلب git وإنترنت أثناء البناء فقط).
# - للاختبار على Linux: cmake -S . -B build -DOMNILLM_LLAMA_DIR=/path/to/llama.cpp -DOMNILLM_HOST_TEST=ON
cmake_minimum_required(VERSION 3.22)
project(omnillm LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# الإصدار المثبّت (وسم Git). غيّره عمداً فقط ثم اختبر: واجهة llama.h تتغير بين الإصدارات.
set(OMNILLM_LLAMA_REF "v0.7.0" CACHE STRING "llama.cpp git tag")
set(OMNILLM_LLAMA_DIR "" CACHE PATH "مسار نسخة محلية من llama.cpp (يتجاوز التنزيل)")
option(OMNILLM_HOST_TEST "ابنِ برنامج اختبار CLI (Linux فقط)" OFF)
option(OMNILLM_ASAN "AddressSanitizer للنواة (اختبار)" OFF)

# إعدادات llama.cpp: مكتبات فقط، بلا أدوات/أمثلة/خادم/curl/openssl
set(BUILD_SHARED_LIBS ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)        # لا تُحسَّن لمعالج جهاز البناء
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)        # خيوط ggml الخاصة تكفي وتُجنّب اعتماد libomp
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)  # يجلب مصدراً إضافياً من الشبكة: غير لازم الآن
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)

if(ANDROID)
    # backends كمكتبات ديناميكية بكل متغيرات المعالج: يختار ggml أفضلها وقت التشغيل (يحمّلها من nativeLibraryDir)
    set(GGML_BACKEND_DL ON CACHE BOOL "" FORCE)
    set(GGML_CPU_ALL_VARIANTS ON CACHE BOOL "" FORCE)
else()
    set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
endif()

if(OMNILLM_ASAN)
    add_compile_options(-fsanitize=address -fno-omit-frame-pointer -g)
    add_link_options(-fsanitize=address)
endif()

if(OMNILLM_LLAMA_DIR)
    message(STATUS "OmniLlm: llama.cpp من ${OMNILLM_LLAMA_DIR}")
    add_subdirectory(${OMNILLM_LLAMA_DIR} llama-build EXCLUDE_FROM_ALL)
    set(LLAMA_ROOT ${OMNILLM_LLAMA_DIR})
else()
    include(FetchContent)
    FetchContent_Declare(llama GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git GIT_TAG ${OMNILLM_LLAMA_REF} GIT_SHALLOW ON)
    FetchContent_MakeAvailable(llama)
    set(LLAMA_ROOT ${llama_SOURCE_DIR})
endif()

add_library(omnillm SHARED omnillm_core.cpp omnillm_jni.cpp)
target_compile_definitions(omnillm PRIVATE OMNILLM_LLAMA_REF="${OMNILLM_LLAMA_REF}")
target_include_directories(omnillm PRIVATE ${LLAMA_ROOT}/include ${LLAMA_ROOT}/ggml/include)
target_link_libraries(omnillm PRIVATE llama ggml)
if(ANDROID)
    target_link_libraries(omnillm PRIVATE log)
    # الصفحات 16KB (Android 15+): NDK r27 يحتاج هذا الخيار صراحة
    target_link_options(omnillm PRIVATE -Wl,-z,max-page-size=16384)
else()
    find_package(JNI)
    if(JNI_FOUND)
        target_include_directories(omnillm PRIVATE ${JNI_INCLUDE_DIRS})
    else()
        message(FATAL_ERROR "jni.h غير موجود (ثبّت JDK) — مطلوب لاختبار الجسر")
    endif()
endif()

if(OMNILLM_HOST_TEST AND NOT ANDROID)
    add_executable(omnillm_host_test host_test.cpp omnillm_core.cpp)
    target_compile_definitions(omnillm_host_test PRIVATE OMNILLM_LLAMA_REF="${OMNILLM_LLAMA_REF}")
    target_include_directories(omnillm_host_test PRIVATE ${LLAMA_ROOT}/include ${LLAMA_ROOT}/ggml/include)
    target_link_libraries(omnillm_host_test PRIVATE llama ggml pthread)
endif()
