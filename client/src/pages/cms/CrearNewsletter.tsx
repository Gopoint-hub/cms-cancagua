import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, Send, Upload, Sparkles, ArrowLeft, ArrowRight, Eye, Calendar, 
  Clock, X, Bot, User, RefreshCw, Check, FileText, Users, Mail, Pencil,
  Wand2, ChevronRight, CheckCircle2, Mic, MicOff, Square, Link2, ExternalLink,
  Monitor, Smartphone, BookOpen
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";