# Office convert service: ASP.NET Core + Syncfusion DocIO/XlsIO — no external
# binary, just the .NET runtime and the published managed assemblies.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY OfficeConvert.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
# SkiaSharp (behind the *Renderer packages) needs fontconfig, and the PDF
# output needs real fonts to render with — without these every document
# converts, but in a fallback face. Liberation covers the Arial/Times/Courier
# metrics most Office files ask for.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libfontconfig1 fonts-liberation fonts-dejavu \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app

ENTRYPOINT ["dotnet", "OfficeConvert.dll"]
